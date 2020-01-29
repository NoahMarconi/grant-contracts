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

  const GrantStatus = {
    INIT:     0,
    SUCCESS:  1,
    DONE:     2
  }


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
        //console.log("_fundReceipt " + JSON.stringify(_fundReceipt));
        const logFundingEvent = _fundReceipt.events[0].eventSignature;
        expect(logFundingEvent).to.eq("LogFunding(address,uint256)");

        if(_fundReceipt.events.length == 2){
          const logFundingComplete = _fundReceipt.events[1].eventSignature;
          expect(logFundingComplete).to.eq("LogFundingComplete()");
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

    });
    

    

    describe("With Token", () => {
  
      let _managerWallet: Wallet;
      let _grantFromGrantee: Contract;
      let _token: Contract;
      let _donorWallet: Wallet;
      let _grantFromDonor: Contract;

      before(async () => {
        const {
          donorWallet,
          managerWallet,
          grantFromDonor,
          grantFromGrantee,
          token
        } = await waffle.loadFixture(fixture);

        _donorWallet = donorWallet;
        _managerWallet = managerWallet;
        _grantFromDonor = grantFromDonor;
        _grantFromGrantee = grantFromGrantee;
        _token = token;
      });

      describe("when refund received", () => {
        let _grantFromManager: Contract;
        let _grantFromDonor: Contract;
        const _fundAmount = 500;
        const _refundAmount = 20;

        before(async () => {
          const {
            grantFromManager,
            token,
            grantFromDonor
          } = await waffle.loadFixture(fixture);

          _grantFromManager = grantFromManager;
          _grantFromDonor = grantFromDonor;

          await token.approve(grantFromManager.address, 5000);
          await _grantFromDonor.fund(500);
        });

        it('should be funded by donor', async () => {
          expect(await _grantFromDonor.totalFunding()).to.eq(_fundAmount);
        });

        it('should revert if refunded by manager', async () => {
          await expect(_grantFromManager.approveRefund((_fundAmount + _refundAmount), AddressZero))
            .to.be.revertedWith("approveRefund::Invalid Argument. Amount is greater than Available Balance.");
        });

        it('should be refunded by manager', async () => {
          await _grantFromManager.approveRefund(_refundAmount, AddressZero);
          expect(await _grantFromDonor.totalRefunded()).to.eq(_refundAmount);
          expect(await _grantFromDonor.availableBalance()).to.eq((_fundAmount - _refundAmount));
        });

        // Pending
        it.skip("should revert if sender has received a refund", async () => {
          // Refund approved.
          await expect(_grantFromDonor.fund(50000));
           // .to.be.revertedWith("fund::Error. Cannot fund if previously approved for, or received, refund.");
          
          // Refund received.
          // await _grantFromDonor.refund(_donorWallet.address);
          // await expect(_grantFromDonor.fund(5000))
          //   .to.be.revertedWith("fund::Error. Cannot fund if previously approved for, or received, refund.");

        });
      });

      describe.skip("when grant status is SUCCESS", () => {
        let _grantFromDonor: Contract;

        before(async () => {
          const { grantFromDonor, token } = await waffle.loadFixture(fixture);
          _grantFromDonor = grantFromDonor;
          await token.approve(grantFromDonor.address, 10000);
          await _grantFromDonor.fund(10000);

          expect(await _grantFromDonor.grantStatus()).to.be.eq(GrantStatus.SUCCESS);

          await token.approve(grantFromDonor.address, 10000);
        });

        it("should revert", async () => {  
          await expect(_grantFromDonor.fund(10000))
            .to.be.revertedWith("fund::Status Error. Must be GrantStatus.INIT to fund.");
        });
        
      });

      describe.skip("when grant status is DONE", () => {
        let _grantFromDonor: Contract;

        before(async () => {
          const { grantFromManager, grantFromDonor, token } = await waffle.loadFixture(fixture);
          _grantFromDonor = grantFromDonor;
          await token.approve(grantFromDonor.address, 5000);
          await _grantFromDonor.fund(5000);

          await grantFromManager.cancelGrant();
          expect(await grantFromManager.grantStatus()).to.be.eq(GrantStatus.DONE);
        });
        
        it("should revert", async () => {
          await expect(_grantFromDonor.fund(5000))
            .to.be.revertedWith("fund::Status Error. Must be GrantStatus.INIT to fund.");
        });

      });
      
      it.skip("should revert if funding expiration passed");
      it.skip("should revert if contract expiration passed");

      it.skip("should reject ether funding for token funded grants", async () => {
        await expect(_grantFromDonor.fund(1000, { value: 1000 }))
          .to.be.revertedWith("fundWithToken::Currency Error. Cannot send Ether to a token funded grant.");
      });

      describe.skip("When funding tx complete", () => {
        let _grantFromDonor: Contract;
        let _grantFromGrantee: Contract;
        let _token: Contract;

        before(async () => {
          const {
            grantFromDonor,
            grantFromGrantee,
            token
          } = await waffle.loadFixture(fixture);

          _grantFromDonor = grantFromDonor;
          _grantFromGrantee = grantFromGrantee;
          _token = token;

          
          await _token.approve(_grantFromGrantee.address, 1e5);

          _res = await (await _grantFromDonor.fund(10000)).wait();
          //console.log("-------- 2");
          
        });

        it.skip("should emit LogFunding event", async () => {
          const emittedEvent = _res.events[2];
          expect(emittedEvent.event).to.eq("LogFunding");
          expect(emittedEvent.eventSignature).to.eq("LogFunding(address,uint256)");

          const { donor, value } = emittedEvent.args;
          expect(donor).to.eq(_donorWallet.address);
          expect(value).to.eq(bigNumberify(10000));
        });

        it.skip("should emit LogStatusChange event", async () => {
          const emittedEvent = _res.events[3];
          expect(emittedEvent.event).to.eq("LogStatusChange");
          expect(emittedEvent.eventSignature).to.eq("LogStatusChange(uint8)");
          expect(emittedEvent.args).to.include({ grantStatus: GrantStatus.SUCCESS });
        });

        describe.skip("Grant data", () => {

          it("should update donor mapping", async () => {
            const donorStruct = await _grantFromGrantee.getDonor(_donorWallet.address);
            const { refundApproved, funded, refunded } = donorStruct;
            
            expect(funded).to.eq(10000);
            expect(refunded).to.eq(0);
            expect(refundApproved).to.eq(0);
          });

          it("should update totalFunded", async () => {
            const totalFunded = await _grantFromGrantee.totalFunding();
            expect(totalFunded).to.eq(10000);
          });
          
          it("should update grantStatus", async () => {
            const grantStatus = await _grantFromGrantee.grantStatus();
            expect(grantStatus).to.eq(GrantStatus.SUCCESS);
          });
        });

        it("should update the contract balance", async () => {
          const balance = await _token.balanceOf(_grantFromGrantee.address);
          expect(balance).to.eq(10000)
        });

      });

    });


  });
    

});
