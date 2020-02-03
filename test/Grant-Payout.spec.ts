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

  let _amounts = [1000];
  let _targetFunding = _amounts.reduce((a, b) => a + b, 0);

  async function fixture(provider: any, wallets: Wallet[]) {

    const currentTime = (await provider.getBlock(await provider.getBlockNumber())).timestamp;
    const [granteeWallet, donorWallet, managerWallet, secondDonorWallet, unknownWallet] = wallets;
    const token: Contract = await waffle.deployContract(donorWallet, GrantToken, ["Grant Token", "GT", 18]);
    const grantWithToken: Contract = await waffle.deployContract(
      granteeWallet,
      Grant,
      [[granteeWallet.address], _amounts, managerWallet.address, token.address, _targetFunding, currentTime + 86400, currentTime + (86400 * 2)],
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
      token,
      granteeWallet,
      donorWallet,
      managerWallet,
      fundingExpiration: currentTime + 86400,
      contractExpiration: currentTime + (86400 * 2),
      provider,
      secondDonorWallet,
      unknownWallet
    };
  }

  describe("Token", () => {
    describe('Approve Payout', () => {
      let _grantFromDonor: Contract;
      const _fundAmount = 500;
      const _payoutAmount = _fundAmount;
      let _grantFromManager: Contract;
      let _donorWallet: Wallet;
      let _secondDonorWallet: Wallet;
      let _granteeWallet: Wallet;
      let _unknownWallet: Wallet;
      let _token: Contract;

      before(async () => {
          const { 
            token,
            grantFromDonor,
            grantFromManager,
            donorWallet,
            secondDonorWallet,
            granteeWallet,
            unknownWallet
          } = await waffle.loadFixture(fixture);
          
          _grantFromDonor = grantFromDonor;
          _grantFromManager = grantFromManager;
          _donorWallet = donorWallet;
          _secondDonorWallet = secondDonorWallet;
          _granteeWallet = granteeWallet;
          _unknownWallet = unknownWallet;
          _token = token;
  
        await token.approve(grantFromDonor.address, 1000);
        await (await _grantFromDonor.fund(_fundAmount)).wait();
       
      });

      it('should revert if someone other than manager tries to approve payout', async () => {
        await expect(_grantFromDonor.approvePayout(_fundAmount, _granteeWallet.address))
          .to.be.revertedWith('onlyManager::Permission Error. Function can only be called by manager.');
      });

      it('should revert if target funding != total funding', async () => {
        await expect(_grantFromManager.approvePayout(_fundAmount, _granteeWallet.address))
          .to.be.revertedWith('approvePayout::Status Error. Cannot approve if funding target not met.');
      });

      it('should target funding  == total funding', async () => {
        const targetFunding = await _grantFromDonor.targetFunding();
        let totalFunding = await _grantFromDonor.totalFunding();
        await _grantFromDonor.fund(targetFunding - totalFunding);

        totalFunding = await _grantFromDonor.totalFunding();
        expect(targetFunding).to.be.eq(totalFunding);
      });

      
      it('should revert if value > target funding', async () => {
        const {targetFunding, totalPayed, payoutApproved}
          = await _grantFromManager.grantees(_granteeWallet.address);
        // console.log(`target Funding ${targetFunding}, total Payed ${totalPayed}
        // , payout Approved ${payoutApproved}`);
        await expect(_grantFromManager.approvePayout(targetFunding + 1, _granteeWallet.address))
          .to.be.revertedWith('approvePayout::Invalid Argument. value cannot exceed remaining allocation.');
      });

      it('should revert if sender does not match grantee', async () => {
        await expect(_grantFromManager.approvePayout(_payoutAmount, _unknownWallet.address))
          .to.be.revertedWith('approvePayout::Invalid Argument. value cannot exceed remaining allocation.');
      });

      it('should emit LogPayment on approve payment', async () => {
        await expect(_grantFromManager.approvePayout(_payoutAmount, _granteeWallet.address))
          .to.emit(_grantFromManager, "LogPayment")
          .withArgs(_granteeWallet.address, _payoutAmount);
      });

      it('should update total payed of grantee and Grant', async () => {
        const totalPayedOfGrant = await _grantFromManager.totalPayed();
        
        const {targetFunding, totalPayed, payoutApproved}
           = await _grantFromManager.grantees(_granteeWallet.address);

        expect(totalPayedOfGrant).to.be.eq(totalPayed);
        expect(totalPayed).to.be.eq(_payoutAmount);
      });

      // always at last
      it('should revert if grant is already cancelled', async () => {
       // await _grantFromDonor.fund(_fundAmount);
        await _grantFromManager.cancelGrant();
        await expect(_grantFromManager.approvePayout(_fundAmount, _granteeWallet.address))
          .to.be.revertedWith('approvePayout::Status Error. Cannot approve if grant is cancelled.');
      });
    });

    describe('Grantee balance', () => {
      let _grantFromDonor: Contract;
      const _fundAmount = 500;
      const _payoutAmount = _fundAmount;
      let _grantFromManager: Contract;
      let _donorWallet: Wallet;
      let _secondDonorWallet: Wallet;
      let _granteeWallet: Wallet;
      let _unknownWallet: Wallet;
      let _token: Contract;

      before(async () => {
          const { 
            token,
            grantFromDonor,
            grantFromManager,
            donorWallet,
            secondDonorWallet,
            granteeWallet,
            unknownWallet
          } = await waffle.loadFixture(fixture);
          
          _grantFromDonor = grantFromDonor;
          _grantFromManager = grantFromManager;
          _donorWallet = donorWallet;
          _secondDonorWallet = secondDonorWallet;
          _granteeWallet = granteeWallet;
          _unknownWallet = unknownWallet;
          _token = token;
  
        await token.approve(grantFromDonor.address, _targetFunding);
        await (await _grantFromDonor.fund(_targetFunding)).wait();
       
      });

      it('should be zero', async () => {
        let tokenBalance = await _token.balanceOf(_granteeWallet.address);
        expect(tokenBalance).to.eq(0);
      });

      it('should updated with token after approve payout', async () => {
        await _grantFromManager.approvePayout(_payoutAmount, _granteeWallet.address);

        let tokenBalance = await _token.balanceOf(_granteeWallet.address);
        expect(tokenBalance).to.eq(_payoutAmount);
      });
      
    });

  });
  
});
