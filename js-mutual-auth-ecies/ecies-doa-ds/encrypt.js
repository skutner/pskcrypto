'use strict';

const mycrypto = require('../crypto')
const common = require('../common');
const config = require('../config');

function senderMessageWrapAndSerialization(senderECSigVerPublicKey, message, signature, options) {
    options = options || {};
    const defaultOpts = config;
    Object.assign(defaultOpts, options);
    options = defaultOpts;

    return JSON.stringify({
        from_ecsig: mycrypto.PublicKeySerializer.serializeECSigVerPublicKey(senderECSigVerPublicKey, options),
        msg: message.toString(options.encodingFormat),
        sig: signature.toString(options.encodingFormat)
    });
}

module.exports.encrypt = function (senderECSigningKeyPair, receiverECDHPublicKey, message, options) {
    options = options || {};
    const defaultOpts = config;
    Object.assign(defaultOpts, options);
    options = defaultOpts;

    if (!Buffer.isBuffer(message)) {
        throw new Error('Input message has to be of type Buffer')
    }

    common.checkKeyPairMandatoryProperties(senderECSigningKeyPair)

    const ephemeralKeyAgreement = new mycrypto.ECEphemeralKeyAgreement(options)
    const ephemeralPublicKey = ephemeralKeyAgreement.generateEphemeralPublicKey()
    const sharedSecret = ephemeralKeyAgreement.generateSharedSecretForPublicKey(receiverECDHPublicKey)

    const signature = mycrypto.computeDigitalSignature(senderECSigningKeyPair.privateKey, sharedSecret, options)
    const senderAuthMsgEnvelopeSerialized = senderMessageWrapAndSerialization(senderECSigningKeyPair.publicKey, message, signature, options)

    const kdfInput = common.computeKDFInput(ephemeralPublicKey, sharedSecret)
    const { symmetricEncryptionKey, macKey } = common.computeSymmetricEncAndMACKeys(kdfInput, options)

    const iv = mycrypto.getRandomBytes(options.ivSize)
    const ciphertext = mycrypto.symmetricEncrypt(symmetricEncryptionKey, senderAuthMsgEnvelopeSerialized, iv, options)
    const tag = mycrypto.KMAC.computeKMAC(macKey,
        Buffer.concat([ciphertext, iv],
            ciphertext.length + iv.length), options
    )

    return common.createEncryptedEnvelopeObject(receiverECDHPublicKey, ephemeralPublicKey, ciphertext, iv, tag, options)
};
