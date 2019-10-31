/*!
 * Copyright (c) 2017-2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
const {util: {clone}} = bedrock;
const {documentLoader} = require('bedrock-jsonld-document-loader');
const {Ed25519KeyPair} = require('crypto-ld');
const jsigs = require('jsonld-signatures');
const jsonpatch = require('fast-json-patch');
const mockData = require('./mock.data');
const voValidator = require('veres-one-validator');
const {CapabilityInvocation} = require('ocapld');
const {suites: {Ed25519Signature2018}} = jsigs;
const v1 = new (require('did-veres-one')).VeresOne();

describe('validate regular DIDs', () => {
  describe('Create Operations', () => {
    it('validates a proper CreateWebLedgerRecord operation', async () => {
      const {did, mockDoc, capabilityInvocationKey} = await _generateDid();
      const mockOperation = clone(mockData.operations.create);
      const capabilityAction = 'create';
      mockOperation.record = mockDoc;
      // FIXME: add an AuthorizeRequest proof that will pass json-schema
      // validation for testnet v2 *not* a valid signature
      mockOperation.proof = clone(mockData.proof);
      const s = await jsigs.sign(mockOperation, {
        compactProof: false,
        documentLoader,
        suite: new Ed25519Signature2018({key: capabilityInvocationKey}),
        purpose: new CapabilityInvocation({capability: did, capabilityAction})
      });
      const result = await voValidator.validate({
        basisBlockHeight: 0,
        ledgerNode: mockData.ledgerNode,
        validatorInput: s,
        validatorConfig: mockData.ledgerConfigurations.alpha
          .operationValidator[0],
      });
      should.exist(result);
      result.valid.should.be.a('boolean');
      result.valid.should.be.true;
    });
    it('validates a DID generated by did-veres-one', async () => {
      const mockDoc = await v1.generate();
      const did = mockDoc.id;
      const keyId = mockDoc.getVerificationMethod(
        {proofPurpose: 'capabilityInvocation'}).id;
      const capabilityInvocationKey = mockDoc.keys[keyId];
      const mockOperation = clone(mockData.operations.create);
      const capabilityAction = 'create';
      mockOperation.record = mockDoc.doc;
      // add an AuthorizeRequest proof that will pass json-schema validation for
      // testnet v2 *not* a valid signature
      mockOperation.proof = clone(mockData.proof);
      const s = await jsigs.sign(mockOperation, {
        compactProof: false,
        documentLoader,
        suite: new Ed25519Signature2018({key: capabilityInvocationKey}),
        purpose: new CapabilityInvocation({capability: did, capabilityAction})
      });
      const result = await voValidator.validate({
        basisBlockHeight: 0,
        ledgerNode: mockData.ledgerNode,
        validatorInput: s,
        validatorConfig: mockData.ledgerConfigurations.alpha
          .operationValidator[0],
      });
      should.exist(result);
      result.valid.should.be.a('boolean');
      result.valid.should.be.true;
    });
    it('rejects an improper CreateWebLedgerRecord operation', async () => {
      const {did, mockDoc, capabilityInvocationKey} = await _generateBadDid();
      const mockOperation = clone(mockData.operations.create);
      const capabilityAction = 'create';
      mockOperation.record = mockDoc;
      // add an AuthorizeRequest proof that will pass json-schema validation for
      // testnet v2 *not* a valid signature
      mockOperation.proof = clone(mockData.proof);
      const s = await jsigs.sign(mockOperation, {
        compactProof: false,
        documentLoader,
        suite: new Ed25519Signature2018({key: capabilityInvocationKey}),
        purpose: new CapabilityInvocation({capability: did, capabilityAction})
      });
      const result = await voValidator.validate({
        basisBlockHeight: 0,
        ledgerNode: mockData.ledgerNode,
        validatorInput: s,
        validatorConfig: mockData.ledgerConfigurations.alpha
          .operationValidator[0],
      });
      should.exist(result);
      result.valid.should.be.a('boolean');
      result.valid.should.be.false;
      should.exist(result.error);
      result.error.name.should.equal('ValidationError');
      result.error.message.should.equal('Error validating DID.');
      result.error.cause.message.should.equal(
        'Invalid DID key ID; key ID does not match the DID.');
    });
    it('rejects a duplicate create operation', async () => {
      const {did, mockDoc, capabilityInvocationKey} = await _generateDid();
      const mockOperation = clone(mockData.operations.create);
      const capabilityAction = 'create';
      // add the new document to the mock document loader as if it were on
      // ledger must clone this going into the document loader, otherwise it
      // will be mutated
      mockData.existingDids[did] = clone(mockDoc);
      mockOperation.record = mockDoc;
      // add an AuthorizeRequest proof that will pass json-schema validation for
      // testnet v2 *not* a valid signature
      mockOperation.proof = clone(mockData.proof);
      const s = await jsigs.sign(mockOperation, {
        compactProof: false,
        documentLoader,
        suite: new Ed25519Signature2018({key: capabilityInvocationKey}),
        purpose: new CapabilityInvocation({capability: did, capabilityAction})
      });
      const result = await voValidator.validate({
        basisBlockHeight: 10,
        ledgerNode: mockData.ledgerNode,
        validatorInput: s,
        validatorConfig: mockData.ledgerConfigurations.alpha
          .operationValidator[0],
      });
      should.exist(result);
      result.valid.should.be.a('boolean');
      result.valid.should.be.false;
      should.exist(result.error);
      result.error.name.should.equal('DuplicateError');
    });

    describe('Create DID with a service', () => {
      const validatorParameterSet =
        'did:v1:uuid:b49fc147-5966-4407-a428-b597a77461ba';
      const validatorConfig = clone(mockData.ledgerConfigurations.alpha
        .operationValidator[0]);
      validatorConfig.validatorParameterSet = validatorParameterSet;

      before(() => {
        const validatorParameterSetDoc = clone(
          mockData.validatorParameterSet.alpha);
        validatorParameterSetDoc.id = validatorParameterSet;
        mockData.existingDids[validatorParameterSet] = validatorParameterSetDoc;
      });
      it('validates a DID with one proper service descriptor', async () => {
        const mockDoc = await v1.generate();

        mockDoc.addService({
          fragment: 'foo',
          type: 'urn:foo',
          endpoint:
            'https://example.com/api/e61388cf-2464-4739-b37b-81f178db010b',
        });

        const did = mockDoc.id;
        const keyId = mockDoc.getVerificationMethod(
          {proofPurpose: 'capabilityInvocation'}).id;
        const capabilityInvocationKey = mockDoc.keys[keyId];
        const mockOperation = clone(mockData.operations.create);
        const capabilityAction = 'create';
        mockOperation.record = mockDoc.doc;
        // add an AuthorizeRequest proof that will pass json-schema
        // validation for
        // testnet v2 *not* a valid signature
        mockOperation.proof = clone(mockData.proof);
        const s = await jsigs.sign(mockOperation, {
          compactProof: false,
          documentLoader,
          suite: new Ed25519Signature2018({key: capabilityInvocationKey}),
          purpose: new CapabilityInvocation({capability: did, capabilityAction})
        });
        const result = await voValidator.validate({
          basisBlockHeight: 0,
          ledgerNode: mockData.ledgerNode,
          validatorInput: s,
          validatorConfig,
        });
        should.exist(result);
        result.valid.should.be.a('boolean');
        result.valid.should.be.true;
      });
      it('validates a DID with two proper service descriptors', async () => {
        const mockDoc = await v1.generate();

        mockDoc.addService({
          fragment: 'foo',
          type: 'urn:foo',
          endpoint:
            'https://example.com/api/e61388cf-2464-4739-b37b-81f178db010b',
        });
        mockDoc.addService({
          fragment: 'bar',
          type: 'urn:bar',
          endpoint:
            'https://example.com/api/836cf564-e86c-4428-9822-ad8ad788c124',
        });

        const did = mockDoc.id;
        const keyId = mockDoc.getVerificationMethod(
          {proofPurpose: 'capabilityInvocation'}).id;
        const capabilityInvocationKey = mockDoc.keys[keyId];
        const mockOperation = clone(mockData.operations.create);
        const capabilityAction = 'create';
        mockOperation.record = mockDoc.doc;
        // add an AuthorizeRequest proof that will pass json-schema
        // validation for
        // testnet v2 *not* a valid signature
        mockOperation.proof = clone(mockData.proof);
        const s = await jsigs.sign(mockOperation, {
          compactProof: false,
          documentLoader,
          suite: new Ed25519Signature2018({key: capabilityInvocationKey}),
          purpose: new CapabilityInvocation({capability: did, capabilityAction})
        });
        const result = await voValidator.validate({
          basisBlockHeight: 0,
          ledgerNode: mockData.ledgerNode,
          validatorInput: s,
          validatorConfig,
        });
        should.exist(result);
        result.valid.should.be.a('boolean');
        result.valid.should.be.true;
      });
      it('rejects a DID with an invalid service endpoint', async () => {
        const mockDoc = await v1.generate();

        mockDoc.addService({
          fragment: 'foo',
          type: 'urn:foo',
          endpoint:
            'https://invalid.com/api/e61388cf-2464-4739-b37b-81f178db010b',
        });

        const did = mockDoc.id;
        const keyId = mockDoc.getVerificationMethod(
          {proofPurpose: 'capabilityInvocation'}).id;
        const capabilityInvocationKey = mockDoc.keys[keyId];
        const mockOperation = clone(mockData.operations.create);
        const capabilityAction = 'create';
        mockOperation.record = mockDoc.doc;
        // add an AuthorizeRequest proof that will pass json-schema
        // validation for
        // testnet v2 *not* a valid signature
        mockOperation.proof = clone(mockData.proof);
        const s = await jsigs.sign(mockOperation, {
          compactProof: false,
          documentLoader,
          suite: new Ed25519Signature2018({key: capabilityInvocationKey}),
          purpose: new CapabilityInvocation({capability: did, capabilityAction})
        });
        const result = await voValidator.validate({
          basisBlockHeight: 0,
          ledgerNode: mockData.ledgerNode,
          validatorInput: s,
          validatorConfig,
        });
        should.exist(result);
        result.valid.should.be.a('boolean');
        result.valid.should.be.false;
        should.exist(result.error);
        const {error} = result;
        error.name.should.equal('ValidationError');
        should.exist(error.details.allowedServiceBaseUrl);
      });
      it('rejects a DID with good and bad service descriptors', async () => {
        const mockDoc = await v1.generate();

        mockDoc.addService({
          fragment: 'foo',
          type: 'urn:foo',
          endpoint:
            'https://example.com/api/e61388cf-2464-4739-b37b-81f178db010b',
        });
        mockDoc.addService({
          fragment: 'bar',
          type: 'urn:bar',
          endpoint:
            'https://invalid.com/api/836cf564-e86c-4428-9822-ad8ad788c124',
        });

        const did = mockDoc.id;
        const keyId = mockDoc.getVerificationMethod(
          {proofPurpose: 'capabilityInvocation'}).id;
        const capabilityInvocationKey = mockDoc.keys[keyId];
        const mockOperation = clone(mockData.operations.create);
        const capabilityAction = 'create';
        mockOperation.record = mockDoc.doc;
        // add an AuthorizeRequest proof that will pass json-schema
        // validation for
        // testnet v2 *not* a valid signature
        mockOperation.proof = clone(mockData.proof);
        const s = await jsigs.sign(mockOperation, {
          compactProof: false,
          documentLoader,
          suite: new Ed25519Signature2018({key: capabilityInvocationKey}),
          purpose: new CapabilityInvocation({capability: did, capabilityAction})
        });
        const result = await voValidator.validate({
          basisBlockHeight: 0,
          ledgerNode: mockData.ledgerNode,
          validatorInput: s,
          validatorConfig,
        });
        should.exist(result);
        result.valid.should.be.a('boolean');
        result.valid.should.be.false;
        should.exist(result.error);
        const {error} = result;
        error.name.should.equal('ValidationError');
        should.exist(error.details.allowedServiceBaseUrl);
      });
      it('rejects a DID if allowedServiceBaseUrl is not defined', async () => {
        const mockDoc = await v1.generate();

        mockDoc.addService({
          fragment: 'foo',
          type: 'urn:foo',
          endpoint:
            'https://example.com/api/e61388cf-2464-4739-b37b-81f178db010b',
        });

        const did = mockDoc.id;
        const keyId = mockDoc.getVerificationMethod(
          {proofPurpose: 'capabilityInvocation'}).id;
        const capabilityInvocationKey = mockDoc.keys[keyId];
        const mockOperation = clone(mockData.operations.create);
        const capabilityAction = 'create';
        mockOperation.record = mockDoc.doc;
        // add an AuthorizeRequest proof that will pass json-schema
        // validation for
        // testnet v2 *not* a valid signature
        mockOperation.proof = clone(mockData.proof);
        const s = await jsigs.sign(mockOperation, {
          compactProof: false,
          documentLoader,
          suite: new Ed25519Signature2018({key: capabilityInvocationKey}),
          purpose: new CapabilityInvocation({capability: did, capabilityAction})
        });

        // this document does not exist on the ledger
        const badValidatorConfig = clone(validatorConfig);
        badValidatorConfig.validatorParameterSet =
          'did:v1:urn:347e7d85-5a36-44e4-9c7b-56a48809ae37';

        const result = await voValidator.validate({
          basisBlockHeight: 0,
          ledgerNode: mockData.ledgerNode,
          validatorInput: s,
          validatorConfig: badValidatorConfig,
        });
        should.exist(result);
        result.valid.should.be.a('boolean');
        result.valid.should.be.false;
        should.exist(result.error);
        const {error} = result;
        error.name.should.equal('InvalidStateError');
        // should.exist(error.details.allowedServiceBaseUrl);
      });
    });
  }); // end create operations

  describe('Update Operations', () => {
    it('validates an update operation', async () => {
      const {did, mockDoc, capabilityInvocationKey} = await _generateDid();
      const mockOperation = clone(mockData.operations.update);
      let capabilityAction = 'create';
      // add the new document to the mock document loader as if it were on
      // ledger
      // clone here so we can proceed with making changes to mockDoc
      mockData.existingDids[did] = clone(mockDoc);

      const observer = jsonpatch.observe(mockDoc);
      const newKey = await Ed25519KeyPair.generate({controller: did});
      newKey.id = _generateKeyId({did, key: newKey});
      mockDoc.authentication.push({
        id: newKey.id,
        type: newKey.type,
        controller: newKey.controller,
        publicKeyBase58: newKey.publicKeyBase58
      });
      mockOperation.recordPatch.patch = jsonpatch.generate(observer);
      mockOperation.recordPatch.target = did;
      // add an AuthorizeRequest proof that will pass json-schema validation for
      // testnet v2 *not* a valid signature
      mockOperation.proof = clone(mockData.proof);
      capabilityAction = 'update';
      const s = await jsigs.sign(mockOperation, {
        compactProof: false,
        documentLoader,
        suite: new Ed25519Signature2018({key: capabilityInvocationKey}),
        purpose: new CapabilityInvocation({capability: did, capabilityAction})
      });
      const result = await voValidator.validate({
        basisBlockHeight: 10,
        ledgerNode: mockData.ledgerNode,
        validatorInput: s,
        validatorConfig: mockData.ledgerConfigurations.alpha
          .operationValidator[0],
      });
      should.exist(result);
      result.valid.should.be.a('boolean');
      result.valid.should.be.true;
      should.not.exist(result.error);
    });
    // the operation is altered after the proof
    it('rejects an altered operation', async () => {
      const {did, mockDoc, capabilityInvocationKey} = await _generateDid();
      const mockOperation = clone(mockData.operations.update);
      let capabilityAction = 'create';
      // add the new document to the mock document loader as if it were on
      // ledger
      // clone here so we can proceed with making changes to mockDoc
      mockData.existingDids[did] = clone(mockDoc);

      const observer = jsonpatch.observe(mockDoc);
      const newKey = await Ed25519KeyPair.generate({controller: did});
      newKey.id = _generateKeyId({did, key: newKey});
      mockDoc.authentication.push({
        id: newKey.id,
        type: newKey.type,
        controller: newKey.controller,
        publicKeyBase58: newKey.publicKeyBase58
      });
      mockOperation.recordPatch.patch = jsonpatch.generate(observer);
      mockOperation.recordPatch.target = did;
      // add an AuthorizeRequest proof that will pass json-schema validation for
      // testnet v2 *not* a valid signature
      mockOperation.proof = clone(mockData.proof);
      capabilityAction = 'update';
      const s = await jsigs.sign(mockOperation, {
        compactProof: false,
        documentLoader,
        suite: new Ed25519Signature2018({key: capabilityInvocationKey}),
        purpose: new CapabilityInvocation({capability: did, capabilityAction})
      });

      // after proof, change the patch target
      const {did: did2} = await _generateDid();
      mockOperation.recordPatch.target = did2;

      const result = await voValidator.validate({
        basisBlockHeight: 10,
        ledgerNode: mockData.ledgerNode,
        validatorInput: s,
        validatorConfig: mockData.ledgerConfigurations.alpha
          .operationValidator[0],
      });
      result.valid.should.be.false;
      // fails because the signature is invalid
      result.error.name.should.equal('ValidationError');
      should.exist(result.error.details.proofVerifyResult);
      const {proofVerifyResult} = result.error.details;
      proofVerifyResult.verified.should.be.false;
      proofVerifyResult.error[0].message.should.equal('Invalid signature.');
    });
    it('rejects update operation signed by an alternate DID', async () => {
      // create an alternate DID that will sign the operation
      const {
        did: did1, mockDoc: mockDoc1,
        capabilityInvocationKey: capabilityInvocationKey1
      } = await _generateDid();
      mockData.existingDids[did1] = clone(mockDoc1);

      const {did, mockDoc} = await _generateDid();
      const mockOperation = clone(mockData.operations.update);
      let capabilityAction = 'create';
      // add the new document to the mock document loader as if it were on
      // ledger
      // clone here so we can proceed with making changes to mockDoc
      mockData.existingDids[did] = clone(mockDoc);

      const observer = jsonpatch.observe(mockDoc);
      const newKey = await Ed25519KeyPair.generate({controller: did});
      newKey.id = _generateKeyId({did, key: newKey});
      mockDoc.authentication.push({
        id: newKey.id,
        type: newKey.type,
        controller: newKey.controller,
        publicKeyBase58: newKey.publicKeyBase58
      });
      mockOperation.recordPatch.patch = jsonpatch.generate(observer);

      mockOperation.recordPatch.target = did;

      // add an AuthorizeRequest proof that will pass json-schema validation for
      // testnet v2 *not* a valid signature
      mockOperation.proof = clone(mockData.proof);
      capabilityAction = 'update';

      // signing with a key from another valid DID
      const s = await jsigs.sign(mockOperation, {
        compactProof: false,
        documentLoader,
        suite: new Ed25519Signature2018({key: capabilityInvocationKey1}),
        purpose: new CapabilityInvocation({capability: did, capabilityAction})
      });
      const result = await voValidator.validate({
        basisBlockHeight: 10,
        ledgerNode: mockData.ledgerNode,
        validatorInput: s,
        validatorConfig: mockData.ledgerConfigurations.alpha
          .operationValidator[0],
      });
      result.valid.should.be.false;
      should.exist(result.error);
      should.exist(result.error.details.proofVerifyResult);
      const {proofVerifyResult} = result.error.details;
      proofVerifyResult.verified.should.be.false;
      proofVerifyResult.error[0].message.should.equal(
        'The authorized invoker does not match the verification method or ' +
        'its controller.');
    });
    it('rejects update operation signed with incorrect target', async () => {
      // create an alternate DID that will sign the operation
      const {did: did1, mockDoc: mockDoc1} = await _generateDid();
      mockData.existingDids[did1] = clone(mockDoc1);

      const {did, mockDoc, capabilityInvocationKey} = await _generateDid();
      const mockOperation = clone(mockData.operations.update);
      let capabilityAction = 'create';
      // add the new document to the mock document loader as if it were on
      // ledger
      // clone here so we can proceed with making changes to mockDoc
      mockData.existingDids[did] = clone(mockDoc);

      // `did` generates a patch against `did1`
      const observer = jsonpatch.observe(mockDoc1);
      const newKey = await Ed25519KeyPair.generate({controller: did});
      newKey.id = _generateKeyId({did, key: newKey});
      mockDoc1.authentication.push({
        id: newKey.id,
        type: newKey.type,
        controller: newKey.controller,
        publicKeyBase58: newKey.publicKeyBase58
      });
      mockOperation.recordPatch.patch = jsonpatch.generate(observer);

      // the operation is being submitted by `did` against `did1`
      mockOperation.recordPatch.target = did1;

      // add an AuthorizeRequest proof that will pass json-schema validation for
      // testnet v2 *not* a valid signature
      mockOperation.proof = clone(mockData.proof);
      capabilityAction = 'update';

      // signing with a key from another valid DID
      const s = await jsigs.sign(mockOperation, {
        compactProof: false,
        documentLoader,
        suite: new Ed25519Signature2018({key: capabilityInvocationKey}),
        purpose: new CapabilityInvocation({capability: did, capabilityAction})
      });
      const result = await voValidator.validate({
        basisBlockHeight: 10,
        ledgerNode: mockData.ledgerNode,
        validatorInput: s,
        validatorConfig: mockData.ledgerConfigurations.alpha
          .operationValidator[0],
      });
      result.valid.should.be.false;
      should.exist(result.error);
      should.exist(result.error.details.proofVerifyResult);
      const {proofVerifyResult} = result.error.details;
      proofVerifyResult.verified.should.be.false;
      proofVerifyResult.error[0].message.should.contain(
        'does not match root capability target');
    });
    // proof has `capabilityAction` === `create`
    it('rejects update operation without proper capabilityAction', async () => {
      const {did, mockDoc, capabilityInvocationKey} = await _generateDid();
      const mockOperation = clone(mockData.operations.update);
      let capabilityAction = 'create';
      // add the new document to the mock document loader as if it were on
      // ledger
      // clone here so we can proceed with making changes to mockDoc
      mockData.existingDids[did] = clone(mockDoc);
      const observer = jsonpatch.observe(mockDoc);
      const newKey = await Ed25519KeyPair.generate({controller: did});
      newKey.id = _generateKeyId({did, key: newKey});
      mockDoc.authentication.push({
        id: newKey.id,
        type: newKey.type,
        controller: newKey.controller,
        publicKeyBase58: newKey.publicKeyBase58
      });
      mockOperation.recordPatch.patch = jsonpatch.generate(observer);
      mockOperation.recordPatch.target = did;
      // add an AuthorizeRequest proof that will pass json-schema validation for
      // testnet v2 *not* a valid signature
      mockOperation.proof = clone(mockData.proof);

      // capability action must be `update`
      capabilityAction = 'create';

      const s = await jsigs.sign(mockOperation, {
        compactProof: false,
        documentLoader,
        suite: new Ed25519Signature2018({key: capabilityInvocationKey}),
        purpose: new CapabilityInvocation({capability: did, capabilityAction})
      });
      const result = await voValidator.validate({
        basisBlockHeight: 10,
        ledgerNode: mockData.ledgerNode,
        validatorInput: s,
        validatorConfig: mockData.ledgerConfigurations.alpha
          .operationValidator[0],
      });
      result.valid.should.be.false;
      should.exist(result.error);
      // schema validation ensures that proofs with the proper capabilityAction
      // are provided
      result.error.name.should.equal('ValidationError');
    });
    // proof is not signed with the existing capabilityInvocation key
    it('rejects operation when improper key used in proof 1', async () => {
      const {did, mockDoc} = await _generateDid();
      const mockOperation = clone(mockData.operations.update);
      let capabilityAction = 'create';
      // add the new document to the mock document loader as if it were on
      // ledger
      // clone here so we can proceed with making changes to mockDoc
      mockData.existingDids[did] = clone(mockDoc);
      const observer = jsonpatch.observe(mockDoc);
      const newKey = await Ed25519KeyPair.generate({controller: did});
      newKey.id = _generateKeyId({did, key: newKey});
      mockDoc.authentication.push({
        id: newKey.id,
        type: newKey.type,
        controller: newKey.controller,
        publicKeyBase58: newKey.publicKeyBase58
      });
      mockOperation.recordPatch.patch = jsonpatch.generate(observer);
      mockOperation.recordPatch.target = did;
      // add an AuthorizeRequest proof that will pass json-schema validation for
      // testnet v2 *not* a valid signature
      mockOperation.proof = clone(mockData.proof);
      capabilityAction = 'update';

      // *must* use `capabilityInvocationKey`
      const s = await jsigs.sign(mockOperation, {
        compactProof: false,
        documentLoader,
        suite: new Ed25519Signature2018({key: newKey}),
        purpose: new CapabilityInvocation({capability: did, capabilityAction})
      });
      const result = await voValidator.validate({
        basisBlockHeight: 10,
        ledgerNode: mockData.ledgerNode,
        validatorInput: s,
        validatorConfig: mockData.ledgerConfigurations.alpha
          .operationValidator[0],
      });
      result.valid.should.be.false;
      should.exist(result.error);
      // fails because the key in the proof is not found in the did document
      result.error.name.should.equal('ValidationError');
      should.exist(result.error.details.proofVerifyResult);
      const {proofVerifyResult} = result.error.details;
      proofVerifyResult.verified.should.be.false;
      proofVerifyResult.error[0].httpStatusCode.should.equal(404);
    });
    // proof is signed with a malicious key
    it('rejects operation when improper key used in proof 2', async () => {
      const {did, mockDoc, capabilityInvocationKey} = await _generateDid();
      const mockOperation = clone(mockData.operations.update);
      let capabilityAction = 'create';
      // add the new document to the mock document loader as if it were on
      // ledger
      // clone here so we can proceed with making changes to mockDoc
      mockData.existingDids[did] = clone(mockDoc);
      const observer = jsonpatch.observe(mockDoc);
      const newKey = await Ed25519KeyPair.generate({controller: did});

      // maliciously put the id from capabilityInvocationKey on new key
      newKey.id = capabilityInvocationKey.id;

      mockDoc.authentication.push({
        id: newKey.id,
        type: newKey.type,
        controller: newKey.controller,
        publicKeyBase58: newKey.publicKeyBase58
      });
      mockOperation.recordPatch.patch = jsonpatch.generate(observer);
      mockOperation.recordPatch.target = did;
      // add an AuthorizeRequest proof that will pass json-schema validation for
      // testnet v2 *not* a valid signature
      mockOperation.proof = clone(mockData.proof);
      capabilityAction = 'update';

      // *must* use `capabilityInvocationKey`
      const s = await jsigs.sign(mockOperation, {
        compactProof: false,
        documentLoader,
        suite: new Ed25519Signature2018({key: newKey}),
        purpose: new CapabilityInvocation({capability: did, capabilityAction})
      });
      const result = await voValidator.validate({
        basisBlockHeight: 10,
        ledgerNode: mockData.ledgerNode,
        validatorInput: s,
        validatorConfig: mockData.ledgerConfigurations.alpha
          .operationValidator[0],
      });
      result.valid.should.be.false;
      should.exist(result.error);
      // fails because the signature is invalid
      result.error.name.should.equal('ValidationError');
      should.exist(result.error.details.proofVerifyResult);
      const {proofVerifyResult} = result.error.details;
      proofVerifyResult.verified.should.be.false;
      proofVerifyResult.error[0].message.should.equal('Invalid signature.');
    });

    describe('Updates involving services', () => {
      const validatorParameterSet =
        'did:v1:uuid:b49fc147-5966-4407-a428-b597a77461ba';
      const validatorConfig = clone(mockData.ledgerConfigurations.alpha
        .operationValidator[0]);
      validatorConfig.validatorParameterSet = validatorParameterSet;
      before(() => {
        const validatorParameterSetDoc = clone(
          mockData.validatorParameterSet.alpha);
        validatorParameterSetDoc.id = validatorParameterSet;
        mockData.existingDids[validatorParameterSet] = validatorParameterSetDoc;
      });
      it('validates an update operation', async () => {
        const mockDoc = await v1.generate();
        const mockOperation = clone(mockData.operations.update);
        let capabilityAction = 'create';
        // add the new document to the mock document loader as if it were on
        // ledger
        // clone here so we can proceed with making changes to mockDoc
        const did = mockDoc.id;
        mockData.existingDids[did] = clone(mockDoc.toJSON());

        mockDoc.observe();

        mockDoc.addService({
          fragment: 'foo',
          type: 'urn:foo',
          endpoint:
            'https://example.com/api/e61388cf-2464-4739-b37b-81f178db010b',
        });

        mockOperation.recordPatch = mockDoc.commit();

        const keyId = mockDoc.getVerificationMethod(
          {proofPurpose: 'capabilityInvocation'}).id;
        const capabilityInvocationKey = mockDoc.keys[keyId];

        // add an AuthorizeRequest proof that will pass json-schema
        // validation for
        // testnet v2 *not* a valid signature
        mockOperation.proof = clone(mockData.proof);
        capabilityAction = 'update';
        const s = await jsigs.sign(mockOperation, {
          compactProof: false,
          documentLoader,
          suite: new Ed25519Signature2018({key: capabilityInvocationKey}),
          purpose: new CapabilityInvocation({capability: did, capabilityAction})
        });
        const result = await voValidator.validate({
          basisBlockHeight: 10,
          ledgerNode: mockData.ledgerNode,
          validatorInput: s,
          validatorConfig
        });
        should.exist(result);
        result.valid.should.be.a('boolean');
        result.valid.should.be.true;
        should.not.exist(result.error);
      });
    });
  }); // end update operations
});

function _generateKeyId({did, key}) {
  return `${did}#${key.fingerprint()}`;
}

// the keys for `authentication` and `capabilityDelegation` do not match the DID
async function _generateBadDid() {
  const mockDoc = clone(mockData.privateDidDocuments.alpha);
  const capabilityInvocationKey = await Ed25519KeyPair.generate();
  const keyFingerprint = capabilityInvocationKey.fingerprint();

  const did = `did:v1:nym:${keyFingerprint}`;
  // cryptonym dids are based on fingerprint of capabilityInvokation key
  mockDoc.id = did;
  capabilityInvocationKey.id = _generateKeyId(
    {did, key: capabilityInvocationKey});
  const controller = did;
  capabilityInvocationKey.controller = controller;
  mockDoc.capabilityInvocation[0] = {
    id: capabilityInvocationKey.id,
    type: capabilityInvocationKey.type,
    controller: capabilityInvocationKey.controller,
    publicKeyBase58: capabilityInvocationKey.publicKeyBase58
  };
  return {did, mockDoc, capabilityInvocationKey};
}

async function _generateDid() {
  const mockDoc = clone(mockData.privateDidDocuments.alpha);
  const capabilityInvocationKey = await Ed25519KeyPair.generate();
  const keyFingerprint = capabilityInvocationKey.fingerprint();

  const did = `did:v1:nym:${keyFingerprint}`;
  // cryptonym dids are based on fingerprint of capabilityInvokation key
  mockDoc.id = did;
  capabilityInvocationKey.id = _generateKeyId(
    {did, key: capabilityInvocationKey});
  const controller = did;
  const capabilityDelegationKey = await Ed25519KeyPair.generate({controller});
  capabilityDelegationKey.id = _generateKeyId(
    {did, key: capabilityDelegationKey});
  const authenticationKey = await Ed25519KeyPair.generate({controller});
  authenticationKey.id = _generateKeyId({did, key: authenticationKey});
  capabilityInvocationKey.controller = controller;
  mockDoc.capabilityInvocation[0] = {
    id: capabilityInvocationKey.id,
    type: capabilityInvocationKey.type,
    controller: capabilityInvocationKey.controller,
    publicKeyBase58: capabilityInvocationKey.publicKeyBase58
  };
  mockDoc.capabilityDelegation[0] = {
    id: capabilityDelegationKey.id,
    type: capabilityDelegationKey.type,
    controller: capabilityDelegationKey.controller,
    publicKeyBase58: capabilityDelegationKey.publicKeyBase58
  };
  mockDoc.authentication[0] = {
    id: authenticationKey.id,
    type: authenticationKey.type,
    controller: authenticationKey.controller,
    publicKeyBase58: authenticationKey.publicKeyBase58
  };
  return {did, mockDoc, capabilityInvocationKey};
}
