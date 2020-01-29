import Grant from "../build/Grant.json";
import GrantToken from "../build/GrantToken.json";
import GrantFactory from "../build/GrantFactory.json";
import chai from 'chai';
import * as waffle from "ethereum-waffle";
import { Contract, Wallet, constants } from "ethers";
import { BigNumber } from "ethers/utils/bignumber";
import { Web3Provider, Provider } from "ethers/providers";
import { bigNumberify, randomBytes, solidityKeccak256, id } from "ethers/utils";
import { AddressZero } from "ethers/constants";


chai.use(waffle.solidity);
const { expect, assert } = chai;

describe("Grant", () => {

  async function fixture(provider: any, wallets: Wallet[]) {

    const currentTime = (await provider.getBlock(await provider.getBlockNumber())).timestamp;
    const [granteeWallet, donorWallet, managerWallet] = wallets;
    const token: Contract = await waffle.deployContract(donorWallet, GrantToken, ["Grant Token", "GT", 18]);
    const grantWithToken: Contract = await waffle.deployContract(
      granteeWallet,
      Grant,
      [[granteeWallet.address], [1000], managerWallet.address, token.address, 1000, currentTime + 86400, currentTime + (86400 * 2)],
      { gasLimit: 6e6 }
    );
    const grantWithEther: Contract = await waffle.deployContract(
      granteeWallet,
      Grant,
      [[granteeWallet.address], [1000], managerWallet.address, AddressZero, 1000, currentTime + 86400, currentTime + (86400 * 2)],
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
      fundingExpiration: currentTime + 86400,
      contractExpiration: currentTime + (86400 * 2),
      provider
    };
  }

  describe("When Funding and Refunding", () => {

    describe("With Ether", () => {
      let _grantFromDonorWithEther: Contract;
      let _grantFromManagerWithEther: Contract;
      let _provider: any;
      let _donorWallet: Wallet;
      let _grantFromDonor: Contract;
  
      let _fundReceipt: any;
      const _fundAmount = 1e6;
      const _fundAmountAfterFunding = 1e3;
      const _refundAmount = 5e1;
  
      before(async () => {
        const { 
          grantFromDonorWithEther,
          grantFromManagerWithEther,
          provider,
          donorWallet,
          grantFromDonor 
        } = await waffle.loadFixture(fixture);
        
        _grantFromDonorWithEther = grantFromDonorWithEther;
        _grantFromManagerWithEther = grantFromManagerWithEther;
        _provider = provider;
        _donorWallet = donorWallet;
        _grantFromDonor = grantFromDonor;
  
        // Donor fund Ether
        _fundReceipt = await(await _grantFromDonorWithEther.fund(_fundAmount, { value: _fundAmount})).wait();
      });
  
      it('should be funded by donor', async () => {
        expect(await _grantFromDonorWithEther.totalFunding()).to.eq(_fundAmountAfterFunding);
      });
  
      it('should revert if donor approves refund', async () => {
        await expect(_grantFromDonorWithEther.approveRefund((_fundAmountAfterFunding + _refundAmount), AddressZero))
          .to.be.revertedWith("onlyManager::Permission Error. Function can only be called by manager");
      });
  
      it('should revert if manager approves refund which exceeds the avaliable fund ', async () => {
        await expect(_grantFromManagerWithEther.approveRefund((_fundAmountAfterFunding + _refundAmount), AddressZero))
          .to.be.revertedWith("approveRefund::Invalid Argument. Amount is greater than Available Balance.");
      });
  
      it('should be refunded by manager', async () => {
        await _grantFromManagerWithEther.approveRefund(_refundAmount, AddressZero);
        
        const totalRefunded = await _grantFromManagerWithEther.totalRefunded();
        expect(totalRefunded).to.eq(_refundAmount);
        
        const availableBalance = await _grantFromDonorWithEther.availableBalance();
        expect(availableBalance).to.eq((_fundAmountAfterFunding - _refundAmount));
      });
  
      it("should emit Events", async () => {

        let logFundingEvent: any[] = _fundReceipt.events.filter((event: any) => event.event == 'LogFunding');
        for(let event of logFundingEvent) {
          const logFundingEvent = event.eventSignature;
          expect(logFundingEvent).to.eq("LogFunding(address,uint256)");
        }

        let LogFundingCompleteEvent: any[] = _fundReceipt.events.filter((event: any) => event.event == 'LogFundingComplete');
        for(let event of LogFundingCompleteEvent) {
          const logFundingEvent = event.eventSignature;
          expect(logFundingEvent).to.eq("LogFundingComplete()");
        }

        // const { donor, value } = emittedEvent.args;
        // expect(donor).to.eq(_donorWallet.address);
        // // Only 10000 as change from 15000 was returned.
        // expect(value).to.eq(bigNumberify(10000));
      });

      it("should donor funding balances == fund amount", async () => {
        const donor = await _grantFromDonorWithEther.donors(_donorWallet.address);
        const { funded, refunded } = donor;
        
        expect(funded).to.eq(_fundAmountAfterFunding);
        //expect(refunded).to.eq(0);
      });

      it("should grant status to be true", async () => {
        expect(await _grantFromDonor.canFund()).to.be.true;
      });

      // following test case should be last, because Grant is getting cancelled.
      it('should reject funding if grant is already cancelled', async () => {
        await _grantFromManagerWithEther.cancelGrant();
        await expect(_grantFromDonorWithEther.fund(_fundAmount, { value: _fundAmount}))
          .to.be.revertedWith('fund::Status Error. Grant not open to funding.')
      });
    });
    
    describe("With Token", () => {

      let _donorWallet: Wallet;
      let _grantFromDonor: Contract;
      let _grantFromManager: Contract;
      const _fundAmount = 500;
      const _refundAmount = 20;
      let _fundReceipt: any;


      before(async () => {
        const {
          donorWallet,
          grantFromDonor,
          token,
          grantFromManager,
        } = await waffle.loadFixture(fixture);

        _donorWallet = donorWallet;
        _grantFromDonor = grantFromDonor;
        _grantFromManager = grantFromManager;

        await token.approve(grantFromManager.address, 5000);

        // Donor fund Ether
        _fundReceipt = await (await _grantFromDonor.fund(_fundAmount)).wait();
        //console.log('fund Receipt ' + JSON.stringify(_fundReceipt)
      });

      it('should be funded by donor', async () => {
        expect(await _grantFromDonor.totalFunding()).to.eq(_fundAmount);
      });

      it('should revert if donor approves refund', async () => {
        await expect(_grantFromDonor.approveRefund((_refundAmount), AddressZero))
          .to.be.revertedWith("onlyManager::Permission Error. Function can only be called by manager");
      });

      it('should revert if refunded by manager', async () => {
        await expect(_grantFromManager.approveRefund((_fundAmount + _refundAmount), AddressZero))
          .to.be.revertedWith("approveRefund::Invalid Argument. Amount is greater than Available Balance.");
      });

      it('should be refunded by manager', async () => {
        await _grantFromManager.approveRefund(_refundAmount, AddressZero);

        const totalRefunded = await _grantFromDonor.totalRefunded();
        expect(totalRefunded).to.eq(_refundAmount);

        const availableBalance = await _grantFromDonor.availableBalance();
        expect(availableBalance).to.eq((_fundAmount - _refundAmount));
      });
  
      it("should emit Events", async () => {
        let logFundingEvent: any[] = _fundReceipt.events.filter((event: any) => event.event == 'LogFunding');
        for(let event of logFundingEvent) {
          const logFundingEvent = event.eventSignature;
          expect(logFundingEvent).to.eq("LogFunding(address,uint256)");
        }

        let LogFundingCompleteEvent: any[] = _fundReceipt.events.filter((event: any) => event.event == 'LogFundingComplete');
        for(let event of LogFundingCompleteEvent) {
          const logFundingEvent = event.eventSignature;
          expect(logFundingEvent).to.eq("LogFundingComplete()");
        }
      });

      it("should donor funding balances == fund amount", async () => {
        const donor = await _grantFromDonor.donors(_donorWallet.address);
        const { funded, refunded } = donor;
        expect(funded).to.eq(_fundAmount);
        //expect(refunded).to.eq(0);
      });

      it("should grant status to be true", async () => {
        expect(await _grantFromDonor.canFund()).to.be.true;
      });

      // Pending
      // fund::Transfer Error. ERC20 token transferFrom failed.

      it("should reject if donor fund ether for token funded grants", async () => {
        await expect(_grantFromDonor.fund(_fundAmount, { value: _fundAmount }))
          .to.be.revertedWith("fundWithToken::Currency Error. Cannot send Ether to a token funded grant.");
      });

      // following test case should be last, because Grant is getting cancelled.
      it('should reject funding if grant is already cancelled', async () => {
          await _grantFromManager.cancelGrant();
          await expect(_grantFromDonor.fund(_fundAmount))
            .to.be.revertedWith('fund::Status Error. Grant not open to funding.')
      });
    });

  });
});
