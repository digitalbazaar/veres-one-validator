/*!
 * Copyright (c) 2017-2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
const didVeresOne = require('did-veres-one');
const {documentLoader} = didVeresOne;
const {Ed25519KeyPair} = require('crypto-ld');
const jsigs = require('jsonld-signatures');
const jsonpatch = require('fast-json-patch');
const mockData = require('./mock.data');
const voValidator = require('veres-one-validator');
const {CapabilityInvocation} = require('ocapld');
const {Ed25519Signature2018} = jsigs.suites;

describe.only('validate API', () => {
  it('validates a proper CreateWebLedgerRecord operation', async () => {
    const {did, mockDoc, capabilityInvocationKey} = await _generateDid();
    const mockOperation = bedrock.util.clone(mockData.operations.create);
    const capabilityAction = 'RegisterDid';
    mockOperation.record = mockDoc;
    // add an AuthorizeRequest proof that will pass json-schema validation for
    // testnet v2 *not* a valid signature
    mockOperation.proof = bedrock.util.clone(mockData.proof);
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
  it('rejects a duplicate create operation', async () => {
    const {did, mockDoc, capabilityInvocationKey} = await _generateDid();
    const mockOperation = bedrock.util.clone(mockData.operations.create);
    const capabilityAction = 'RegisterDid';
    // add the new document to the mock document loader as if it were on ledger
    // must clone this going into the document loader, otherwise it will be
    // mutated
    mockData.existingDids[did] = bedrock.util.clone(mockDoc);
    mockOperation.record = mockDoc;
    // add an AuthorizeRequest proof that will pass json-schema validation for
    // testnet v2 *not* a valid signature
    mockOperation.proof = bedrock.util.clone(mockData.proof);
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
  it('validates an update operation', async () => {
    const {did, mockDoc, capabilityInvocationKey} = await _generateDid();
    const mockOperation = bedrock.util.clone(mockData.operations.update);
    let capabilityAction = 'RegisterDid';
    // add the new document to the mock document loader as if it were on ledger
    // clone here so we can proceed with making changes to mockDoc
    mockData.existingDids[did] = bedrock.util.clone(mockDoc);

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
    mockOperation.proof = bedrock.util.clone(mockData.proof);
    capabilityAction = 'UpdateDidDocument';
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
    const mockOperation = bedrock.util.clone(mockData.operations.update);
    let capabilityAction = 'RegisterDid';
    // add the new document to the mock document loader as if it were on ledger
    // clone here so we can proceed with making changes to mockDoc
    mockData.existingDids[did] = bedrock.util.clone(mockDoc);

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
    mockOperation.proof = bedrock.util.clone(mockData.proof);
    capabilityAction = 'UpdateDidDocument';
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
    mockData.existingDids[did1] = bedrock.util.clone(mockDoc1);

    const {did, mockDoc} = await _generateDid();
    const mockOperation = bedrock.util.clone(mockData.operations.update);
    let capabilityAction = 'RegisterDid';
    // add the new document to the mock document loader as if it were on ledger
    // clone here so we can proceed with making changes to mockDoc
    mockData.existingDids[did] = bedrock.util.clone(mockDoc);

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
    mockOperation.proof = bedrock.util.clone(mockData.proof);
    capabilityAction = 'UpdateDidDocument';

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
    mockData.existingDids[did1] = bedrock.util.clone(mockDoc1);

    const {did, mockDoc, capabilityInvocationKey} = await _generateDid();
    const mockOperation = bedrock.util.clone(mockData.operations.update);
    let capabilityAction = 'RegisterDid';
    // add the new document to the mock document loader as if it were on ledger
    // clone here so we can proceed with making changes to mockDoc
    mockData.existingDids[did] = bedrock.util.clone(mockDoc);

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
    mockOperation.proof = bedrock.util.clone(mockData.proof);
    capabilityAction = 'UpdateDidDocument';

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
  // proof has `capabilityAction` === `RegisterDid`
  it('rejects update operation without proper capabilityAction', async () => {
    const {did, mockDoc, capabilityInvocationKey} = await _generateDid();
    const mockOperation = bedrock.util.clone(mockData.operations.update);
    let capabilityAction = 'RegisterDid';
    // add the new document to the mock document loader as if it were on ledger
    // clone here so we can proceed with making changes to mockDoc
    mockData.existingDids[did] = bedrock.util.clone(mockDoc);
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
    mockOperation.proof = bedrock.util.clone(mockData.proof);

    // capability action must be `UpdateDidDocument`
    capabilityAction = 'RegisterDid';

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
  it('rejects update operation when improper key used in proof 1', async () => {
    const {did, mockDoc} = await _generateDid();
    const mockOperation = bedrock.util.clone(mockData.operations.update);
    let capabilityAction = 'RegisterDid';
    // add the new document to the mock document loader as if it were on ledger
    // clone here so we can proceed with making changes to mockDoc
    mockData.existingDids[did] = bedrock.util.clone(mockDoc);
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
    mockOperation.proof = bedrock.util.clone(mockData.proof);
    capabilityAction = 'UpdateDidDocument';

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
  it('rejects update operation when improper key used in proof 2', async () => {
    const {did, mockDoc, capabilityInvocationKey} = await _generateDid();
    const mockOperation = bedrock.util.clone(mockData.operations.update);
    let capabilityAction = 'RegisterDid';
    // add the new document to the mock document loader as if it were on ledger
    // clone here so we can proceed with making changes to mockDoc
    mockData.existingDids[did] = bedrock.util.clone(mockDoc);
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
    mockOperation.proof = bedrock.util.clone(mockData.proof);
    capabilityAction = 'UpdateDidDocument';

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
});

function _generateKeyId({did, key}) {
  // `did` + multibase base58 (0x7a / z) encoding + key fingerprint
  return `${did}#z${key.fingerprint()}`;
}

async function _generateDid() {
  const mockDoc = bedrock.util.clone(mockData.privateDidDocuments.alpha);
  const capabilityInvocationKey = await Ed25519KeyPair.generate();
  const keyFingerprint = `z${capabilityInvocationKey.fingerprint()}`;

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