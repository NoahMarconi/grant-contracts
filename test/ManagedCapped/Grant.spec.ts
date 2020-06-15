import Grant from "../../build/MangedCappedGrant.json";
import GrantToken from "../../build/GrantToken.json";
import GrantFactory from "../../build/GrantFactory.json";
import chai from 'chai';
import * as waffle from "ethereum-waffle";
import { Contract, Wallet, constants } from "ethers";
import { BigNumber } from "ethers/utils/bignumber";
import { Web3Provider, Provider } from "ethers/providers";
import { bigNumberify, randomBytes, solidityKeccak256, id } from "ethers/utils";
import { AddressZero } from "ethers/constants";


chai.use(waffle.solidity);
const { expect } = chai;

describe("Grant", () => {

  const GrantStatus = {
    INIT:     0,
    SUCCESS:  1,
    DONE:     2
  }


  async function fixture(provider: any, wallets: Wallet[]) {

    const currentTime = (await provider.getBlock(await provider.getBlockNumber())).timestamp;
    const [granteeWallet, donorWallet, managerWallet] = wallets;
    const token: Contract = await waffle.deployContract(donorWallet, GrantToken, ["Grant Token", "GT"]);
    const grantWithToken: Contract = await waffle.deployContract(
      granteeWallet,
      Grant,
      [[granteeWallet.address], [1000], managerWallet.address, token.address, 10000, currentTime + 86400, currentTime + (86400 * 2)],
      { gasLimit: 6e6 }
    );
    const grantWithEther: Contract = await waffle.deployContract(
      granteeWallet,
      Grant,
      [[granteeWallet.address], [1000], managerWallet.address, AddressZero, 10000, currentTime + 86400, currentTime + (86400 * 2)],
      { gasLimit: 6e6 }
    );
    const grantFactory: Contract = await waffle.deployContract(donorWallet, GrantFactory, undefined, { gasLimit: 6e6 });

    // Initial token balance.
    await token.mint(donorWallet.address, 1e6);

    const grantFromDonor: Contract = new Contract(grantWithToken.address, Grant.abi, donorWallet);
    const grantFromDonorWithEther: Contract = new Contract(grantWithEther.address, Grant.abi, donorWallet);
    const grantFromManager: Contract = new Contract(grantWithToken.address, Grant.abi, managerWallet);
    const grantFromManagerWithEther: Contract = new Contract(grantWithEther.address, Grant.abi, managerWallet);

    return {
      grantFactory,
      grantWithToken,
      grantWithEther,
      grantFromDonor,
      grantFromDonorWithEther,
      grantFromManager,
      grantFromManagerWithEther,
      grantFromGrantee: grantWithToken,
      token,
      granteeWallet,
      donorWallet,
      managerWallet,
      fundingDeadline: currentTime + 86400,
      contractExpiration: currentTime + (86400 * 2),
      provider
    };
  }


  describe("Create Grant", () => {
    let _granteeAddress: string;
    let _granteeFactory: Contract;
    let _managerAddress: string;
    let _fundingDeadline: BigNumber;
    let _contractExpiration: BigNumber;
    let _grant: Contract;
    let _token: Contract;
    let _provider: Provider;

    describe("When created", () => {
      before(async () => {
        const {
          grantWithToken,
          token,
          granteeWallet,
          managerWallet,
          fundingDeadline,
          contractExpiration,
          provider,
          grantFactory
        } = await waffle.loadFixture(fixture);
        _granteeAddress = granteeWallet.address;
        _granteeFactory = grantFactory;
        _managerAddress = managerWallet.address;
        _fundingDeadline = fundingDeadline;
        _contractExpiration = contractExpiration;
        _grant = grantWithToken;
        _token = token;
        _provider = provider;
      });
      
      it("should fail if fundingDeadline greater than contractExpiration", async () => {
        const currentTime = (await _provider.getBlock(await _provider.getBlockNumber())).timestamp;

        await expect(_granteeFactory.create(
          [_granteeAddress], [1000], _managerAddress, AddressZero, 10000, currentTime + (86400 * 2), currentTime + 86400, "0x0",
          { gasLimit: 6e6 }
        )).to.be.revertedWith("constructor::Invalid Argument. _fundingDeadline must be less than _contractExpiration.");
      });

      it("should fail if fundingDeadline less than now", async () => {
        const currentTime = (await _provider.getBlock(await _provider.getBlockNumber())).timestamp;

        await expect(_granteeFactory.create(
          [_granteeAddress], [1000], _managerAddress, AddressZero, 10000, currentTime - 1, currentTime + 86400, "0x0",
          { gasLimit: 6e6 }
        )).to.be.revertedWith("constructor::Invalid Argument. _fundingDeadline must be 0 or greater than current date.");
      });

      it("should fail if contractExpiration less than now", async () => {
        const currentTime = (await _provider.getBlock(await _provider.getBlockNumber())).timestamp;

        await expect(_granteeFactory.create(
          [_granteeAddress], [1000], _managerAddress, AddressZero, 10000, 0, currentTime - 1, "0x0",
          { gasLimit: 6e6 }
        )).to.be.revertedWith("constructor::Invalid Argument. _contractExpiration must be 0 or greater than current date.");
      });

      it("should persist the correct overall funding target", async () => {
        const targetFunding = await _grant.targetFunding();
        expect(targetFunding).to.eq(10000);
      });

      it("should persist the correct grantee funding target", async () => {
        const grantee = await _grant.getGrantee(_granteeAddress);        
        expect(grantee.targetFunding).to.eq(1000);
      });

      it("should persist the correct manager", async () => {
        const manager = await _grant.manager();
        expect(manager).to.eq(_managerAddress);
      });

      it("should persist the correct currency", async () => {
        const currency = await _grant.currency();
        expect(currency).to.eq(_token.address);
      });

      it("should persist the correct fundingDeadline", async () => {
        const fundingDeadline = await _grant.fundingDeadline();
        expect(fundingDeadline).to.eq(_fundingDeadline);
      });

      it("should persist the correct contractExpiration", async () => {
        const contractExpiration = await _grant.contractExpiration();
        expect(contractExpiration).to.eq(_contractExpiration);
      });

      it("should persist the correct grantStatus", async () => {
        const grantStatus = await _grant.grantStatus();
        expect(grantStatus).to.eq(GrantStatus.INIT);
      });
    });

  });



  describe("Payouts", () => {
    it("should revert if GrantStatus not SUCCESS");
    it("should revert if called by non manager and not a Grantee matching grantee arg");
    describe("approvePayout", () => {
      it("should revert if approved for more than remaining allocation");
      it("should log payment approval event");
      it("should update amount approved");
    });

    describe("withdrawPayout", () => {
      it("should revert if sender does not match grantee");
      it("should revert if value does not match payoutApproved");
      it("should update total payed");
      it("should update payoutApproved");
      it("should update contract balance");
      it("should send payment");
      it("should emit payment event");

    });
  });

  describe("Refunds", () => {
    it("should revert if called by non manager and not a Donor matching donor arg");
    it("should handle correct dilution for payout -> refund -> payout -> refund -> refund");
    describe("approveRefund", () => {
      it("should revert if donor already refunded");
      it("should should update refundApproved");
    });
    describe("withdrawRefund", () => {
      
      it("should revert if sender does not match donor argument");
      it("should update totalRefunded");
      it("should emit a LogRefund event");

      describe("when manager initiated", () => {
        it("should revert if not approved for refund");
      });

      describe("when donor initiated", () => {
        it("should set status to DONE");
        it("should set refundCheckpoint");
      });

      describe("when currency is Ether", () => {
        it("should update contract balance");
        it("should update donor balance");
      });
      describe("when currency is Token", () => {
        it("should update contract balance");
        it("should update donor balance");
      });
    });
  });

});
