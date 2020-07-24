import chai from "chai";
import * as waffle from "ethereum-waffle";
import { Contract, Signer  } from "ethers";


import bre from '@nomiclabs/buidler';
import { BuidlerRuntimeEnvironment } from '@nomiclabs/buidler/types';
import { AddressZero } from "ethers/constants";

chai.use(waffle.solidity);
const { expect } = chai;

import { granteeConstructorTests } from "./shared/GranteeConstructor";

// Constants.
const URI = '/orbitdb/Qmd8TmZrWASypEp4Er9tgWP4kCNQnW4ncSnvjvyHQ3EVSU/';
const AMOUNTS = [150, 456, 111, 23];
const CONTRACT_NAME = "GranteeConstructor";

async function fixture(bre: BuidlerRuntimeEnvironment, contractName: string) {
  const provider = bre.waffle.provider;
  const ethers = bre.ethers;

  // Capture and sort wallets.
  let wallets = await bre.ethers.signers();
  let addresses = await wallets.map(async (x, i) => {
    return {
      signer: x,
      i,
      address: await x.getAddress()
    }
  });
  let sortedAddresses = (await Promise.all(addresses)).sort((x, y) => x.address > y.address ? 1 : -1);
  wallets = sortedAddresses.map(x => x.signer);
  const [
    donorWallet0,
    donorWallet1,
    granteeWallet0,
    granteeWallet1,
    granteeWallet2,
    granteeWallet3    
  ] = wallets;

  // Prepare contract.
  const ContractFactory = await ethers.getContractFactory(contractName);
  const constructorGrantees = [
    await granteeWallet0.getAddress(),
    await granteeWallet1.getAddress(),
    await granteeWallet2.getAddress(),
    await granteeWallet3.getAddress(),
  ]

  // Deploy.
  const contract = await ContractFactory.deploy(
    constructorGrantees,                // Grantees 
    AMOUNTS,                            // Allocations
    true
    );
    
  // Await Deploy.
  await contract.deployed();

  return {
    donors: [
      donorWallet0,
      donorWallet1
    ],
    grantees: [
      granteeWallet0,
      granteeWallet1,
      granteeWallet2,
      granteeWallet3
    ],
    provider,
    contract
  };
}



describe("Grantee-Constructor", () => {

  let _grantees: Signer[];
  let _donors: Signer[];
  let _provider: any;
  let _contract: Contract;

  before(async () => {

    
    const {
      donors,
      grantees,
      provider,
      contract
    } = await fixture(bre, CONTRACT_NAME);


    _grantees = grantees;
    _donors = donors;
    _provider = provider;
    _contract = contract;

  });

  describe("With Ether", () => {

    granteeConstructorTests(
      fixture,     // Fixture for our grant.
      AMOUNTS,     // Grantee amount from global above.
      URI,         // URI from global above.
      true,        // This fixture (unmanagedStream) uses percentage based grants.
      AddressZero, // This fixture (unmanagedStream) uses ether.
      CONTRACT_NAME
    );

  });

});


