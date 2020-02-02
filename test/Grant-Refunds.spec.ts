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
    const [granteeWallet, donorWallet, managerWallet, secondDonorWallet] = wallets;
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
    //await token.mint(secondDonorWallet.address, 1e6);

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
      token,
      granteeWallet,
      donorWallet,
      managerWallet,
      fundingExpiration: currentTime + 86400,
      contractExpiration: currentTime + (86400 * 2),
      provider,
      secondDonorWallet,
    };
  }

  describe("Token", () => {
    describe('Refunding', () => {
      // variables
      let _grantFromDonor: Contract;
      const _fundAmount = 500;
      let _fundReceipt: any;
      let _grantFromManager: Contract;
      let _donorWallet: Wallet;
      let _secondDonorWallet: Wallet;
  
      before(async () => {
          const { 
            token,
            grantFromDonor,
            grantFromManager,
            donorWallet,
            secondDonorWallet,
          } = await waffle.loadFixture(fixture);
          
          _grantFromDonor = grantFromDonor;
          _grantFromManager = grantFromManager;
          _donorWallet = donorWallet;
          _secondDonorWallet = secondDonorWallet;
  
        await token.approve(grantFromDonor.address, 1000);
        
        _fundReceipt = await (await _grantFromDonor.fund(_fundAmount)).wait();
  
        //console.log('Fund Receipt ' + JSON.stringify(_fundReceipt));
          
          
       // let totalRefunded = await _grantFromDonor.totalRefunded();
       // console.log('1. total Refunded ' + totalRefunded);
  
        await _grantFromManager.approveRefund(_fundAmount, AddressZero);
       
        // let totalFunding = await _grantFromDonor.totalFunding();
        // console.log('totalFunding ' + totalFunding);
  
        // totalRefunded = await _grantFromDonor.totalRefunded();
        // console.log('2. total Refunded ' + totalRefunded);
  
        // await _grantFromDonor.withdrawRefund(_donorWallet.address);
  
        // await _grantFromDonor.withdrawRefund(_donorWallet.address);
        
        // let { funded, refunded } = await _grantFromManager.donors(_donorWallet.address);
  
        // console.log('funded ' + funded + ', refunded ' + refunded);
      });

      it('should update Total Refund', async () => {
        const totalRefunded = await _grantFromDonor.totalRefunded();
        expect(totalRefunded).to.eq(_fundAmount);
      })
  
      it('should emit a LogRefund event', async () => {
        await expect(_grantFromDonor.withdrawRefund(_donorWallet.address))
          .to.emit(_grantFromDonor, "LogRefund")
          .withArgs(_donorWallet.address, _fundAmount);
      });

      it('should update donor balance', async () => {
        const { funded, refunded} = await _grantFromManager.donors(_donorWallet.address);
        expect(funded).to.be.eq(_fundAmount);
        expect(refunded).to.be.eq(_fundAmount);
      });
  
      it('Donor again withdraw the fund with amount 0', async () => {
        await expect(_grantFromDonor.withdrawRefund(_donorWallet.address))
          .to.emit(_grantFromDonor, "LogRefund")
          .withArgs(_donorWallet.address, 0);
      });
  
      it('Approve-refund should revert if amount > availableBalance', async () => {
        await expect(_grantFromManager.approveRefund(_fundAmount, AddressZero))
          .to.be.revertedWith('approveRefund::Invalid Argument. Amount is greater than Available Balance.');
      });
  
      //it.skip("should handle correct dilution for payout -> refund -> payout -> refund -> refund");
      // describe("when donor initiated", () => {
      //   it("should set status to DONE");
      //   it("should set refundCheckpoint");
      // });
  
    });
  
    describe('Approve refunding', () => {
      let _grantFromDonor: Contract;
      const _fundAmount = 500;

      before(async () => {
          const { 
            token,
            grantFromDonor,
          } = await waffle.loadFixture(fixture);
          _grantFromDonor = grantFromDonor;
  
        await token.approve(grantFromDonor.address, 1000);      
        await _grantFromDonor.fund(_fundAmount);
      });
  
      it('should revert if called by non manager', async () => {
        await expect(_grantFromDonor.approveRefund(_fundAmount, AddressZero))
          .to.be.revertedWith('onlyManager::Permission Error. Function can only be called by manager.');
      });
  
    });

  });
  
});
