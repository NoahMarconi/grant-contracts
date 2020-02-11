import Grant from "../build/Grant.json";
import GrantToken from "../build/GrantToken.json";
import GrantFactory from "../build/GrantFactory.json";
import chai from "chai";
import * as waffle from "ethereum-waffle";
import { Contract, Wallet, constants } from "ethers";
import { BigNumber } from "ethers/utils/bignumber";
import { Web3Provider, Provider } from "ethers/providers";
import { bigNumberify, randomBytes, solidityKeccak256, id } from "ethers/utils";
import { AddressZero } from "ethers/constants";
import { before } from "mocha";

chai.use(waffle.solidity);
const { expect, assert } = chai;

describe("Grant", () => {
  const _amounts = [1000];
  const _targetFunding = _amounts.reduce((a, b) => a + b, 0);

  async function fixture(provider: any, wallets: Wallet[]) {
    const currentTime = (await provider.getBlock(await provider.getBlockNumber())).timestamp;
    const [granteeWallet, donorWallet, managerWallet, secondDonorWallet, unknownWallet] = wallets;
    const token: Contract = await waffle.deployContract(donorWallet, GrantToken, ["Grant Token", "GT", 18]);
    const grantWithToken: Contract = await waffle.deployContract(
      granteeWallet,
      Grant,
      [
        [granteeWallet.address],
        _amounts,
        managerWallet.address,
        token.address,
        _targetFunding,
        currentTime + 86400,
        currentTime + 86400 * 2
      ],
      { gasLimit: 6e6 }
    );
    const grantWithEther: Contract = await waffle.deployContract(
      granteeWallet,
      Grant,
      [
        [granteeWallet.address],
        _amounts,
        managerWallet.address,
        AddressZero,
        _targetFunding,
        currentTime + 86400,
        currentTime + 86400 * 2
      ],
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
      contractExpiration: currentTime + 86400 * 2,
      provider,
      secondDonorWallet,
      unknownWallet
    };
  }

  describe("Token", () => {
    describe("Refunding", () => {
      let _grantFromDonor: Contract;
      const _fundAmount = 500;
      let _grantFromManager: Contract;
      let _donorWallet: Wallet;
      let _unknownWallet: Wallet;

      before(async () => {
        const { token, grantFromDonor, grantFromManager, donorWallet, unknownWallet } = await waffle.loadFixture(
          fixture
        );

        _grantFromDonor = grantFromDonor;
        _grantFromManager = grantFromManager;
        _donorWallet = donorWallet;
        _unknownWallet = unknownWallet;

        await token.approve(grantFromDonor.address, 1000);

        await _grantFromDonor.fund(_fundAmount);

        await _grantFromManager.approveRefund(_fundAmount, AddressZero);
      });

      it("should update Total Refund", async () => {
        const totalRefunded = await _grantFromDonor.totalRefunded();
        expect(totalRefunded).to.eq(_fundAmount);
      });

      it("should emit a LogRefund event", async () => {
        await expect(_grantFromDonor.withdrawRefund(_donorWallet.address))
          .to.emit(_grantFromDonor, "LogRefund")
          .withArgs(_donorWallet.address, _fundAmount);
      });

      it("should emit LogRefund event", async () => {
        await expect(_grantFromDonor.withdrawRefund(_donorWallet.address))
          .to.emit(_grantFromDonor, "LogRefund")
          .withArgs(_donorWallet.address, 0);
      });

      it("should send 0 token if address does not belong to donor", async () => {
        await expect(_grantFromDonor.withdrawRefund(_unknownWallet.address))
          .to.emit(_grantFromDonor, "LogRefund")
          .withArgs(_unknownWallet.address, 0);
      });

      it("should update total refunded of Grant", async () => {
        const totalRefunded = await _grantFromManager.totalRefunded();
        expect(totalRefunded).to.eq(_fundAmount);
      });
    });

    describe("Approve refunding", () => {
      let _grantFromDonor: Contract;
      const _fundAmount = 500;
      let _grantFromManager: Contract;
      let _granteeWallet: Wallet;

      before(async () => {
        const { token, grantFromDonor, grantFromManager, granteeWallet } = await waffle.loadFixture(fixture);
        _grantFromDonor = grantFromDonor;
        _grantFromManager = grantFromManager;
        _granteeWallet = granteeWallet;

        await token.approve(grantFromDonor.address, 1000);
        await _grantFromDonor.fund(_fundAmount);
      });

      it("should revert if called by non manager", async () => {
        await expect(_grantFromDonor.approveRefund(_fundAmount, AddressZero)).to.be.revertedWith(
          "onlyManager::Permission Error. Function can only be called by manager."
        );
      });

      it("should revert if amount > availableBalance", async () => {
        await expect(_grantFromManager.approveRefund(_fundAmount + 1, AddressZero)).to.be.revertedWith(
          "approveRefund::Invalid Argument. Amount is greater than Available Balance."
        );
      });

      it("should revert if amount > remaining allocation of grantee", async () => {
        const { targetFunding, totalPayed, payoutApproved } = await _grantFromManager.grantees(_granteeWallet.address);

        const amount = targetFunding.sub(totalPayed).sub(payoutApproved);

        await expect(_grantFromManager.approveRefund(amount + 1, _granteeWallet.address)).to.be.revertedWith(
          "approveRefund::Invalid Argument. Value greater than remaining allocation."
        );
      });
    });

    describe("When approve refunding not done by manager", () => {
      let _grantFromDonor: Contract;
      const _fundAmount = 500;
      let _grantFromManager: Contract;
      let _donorWallet: Wallet;

      before(async () => {
        const { token, grantFromDonor, grantFromManager, donorWallet } = await waffle.loadFixture(fixture);

        _grantFromDonor = grantFromDonor;
        _grantFromManager = grantFromManager;
        _donorWallet = donorWallet;

        await token.approve(grantFromDonor.address, 1000);

        await _grantFromDonor.fund(_fundAmount);
      });

      it("then total refunded should be zero", async () => {
        const totalRefunded = await _grantFromManager.totalRefunded();
        expect(totalRefunded).to.eq(0);
      });

      it("then refund to donor should be zero", async () => {
        await expect(_grantFromDonor.withdrawRefund(_donorWallet.address))
          .to.emit(_grantFromDonor, "LogRefund")
          .withArgs(_donorWallet.address, 0);

        const { refunded } = await _grantFromManager.donors(_donorWallet.address);
        expect(refunded).to.eq(0);
      });
    });

    describe("Approve Refund when passing Grantee address as argument", () => {
      let _grantFromDonor: Contract;
      const FUNDING_AMOUNT = 1e3;
      const REFUND_AMOUNT = FUNDING_AMOUNT / 2;
      let _grantFromManager: Contract;
      let _granteeWallet: Wallet;

      before(async () => {
        const { token, grantFromDonor, grantFromManager, granteeWallet } = await waffle.loadFixture(fixture);

        _grantFromDonor = grantFromDonor;
        _grantFromManager = grantFromManager;
        _granteeWallet = granteeWallet;

        await token.approve(grantFromDonor.address, 1e3);
        await _grantFromDonor.fund(FUNDING_AMOUNT);
      });

      it("should not reduce target funding for grantee", async () => {
        let { targetFunding: targetFundingBeforeApproveFund } = await _grantFromManager.grantees(
          _granteeWallet.address
        );

        //  const targetFundingBeforeApproveFund = targetFunding;

        await _grantFromManager.approveRefund(REFUND_AMOUNT, AddressZero);

        let { targetFunding: targetFundingAfterApproveFund } = await _grantFromManager.grantees(_granteeWallet.address);

        //  const targetFundingAfterApproveFund = targetFunding;

        expect(targetFundingBeforeApproveFund).to.eq(targetFundingAfterApproveFund);
      });

      it("should reduce target funding for grantee by refund amount", async () => {
        let { targetFunding: targetFundingBeforeApproveFund } = await _grantFromManager.grantees(
          _granteeWallet.address
        );

        //  const targetFundingBeforeApproveFund = targetFunding;

        await _grantFromManager.approveRefund(REFUND_AMOUNT, _granteeWallet.address);

        let { targetFunding: targetFundingAfterApproveFund } = await _grantFromManager.grantees(_granteeWallet.address);

        // const targetFundingAfterApproveFund = targetFunding;

        expect(targetFundingBeforeApproveFund).to.eq(targetFundingAfterApproveFund.add(REFUND_AMOUNT));
      });
    });

    describe("Donor balance", () => {
      let _grantFromDonor: Contract;
      const FUNDING_AMOUNT = 1e3;
      const REFUND_AMOUNT = FUNDING_AMOUNT / 2;
      let _grantFromManager: Contract;
      let _donorWallet: Wallet;
      let _token: Contract;
      let initialBalanceAfterFunding: any;

      before(async () => {
        const { token, grantFromDonor, grantFromManager, donorWallet } = await waffle.loadFixture(fixture);

        _grantFromDonor = grantFromDonor;
        _grantFromManager = grantFromManager;
        _donorWallet = donorWallet;
        _token = token;

        await token.approve(grantFromDonor.address, 1e3);

        await _grantFromDonor.fund(FUNDING_AMOUNT);

        initialBalanceAfterFunding = await _token.balanceOf(_donorWallet.address);
      });

      it("should not be updated yet", async () => {
        // verifying donor's token balance
        const tokenBalance = await _token.balanceOf(_donorWallet.address);
        expect(initialBalanceAfterFunding).to.eq(tokenBalance);

        // verifying donor's refunded field
        const { refunded } = await _grantFromManager.donors(_donorWallet.address);
        expect(refunded).to.eq(0);
      });

      it("should updated with token after approve withdraw", async () => {
        await _grantFromManager.approveRefund(REFUND_AMOUNT, AddressZero);
        await _grantFromDonor.withdrawRefund(_donorWallet.address);

        // verifying donor's token balance
        const finalBalanceAfterRefunding = await _token.balanceOf(_donorWallet.address);
        expect(initialBalanceAfterFunding.add(REFUND_AMOUNT)).to.eq(finalBalanceAfterRefunding);

        // verifying donor's refunded field
        const { refunded } = await _grantFromManager.donors(_donorWallet.address);
        expect(refunded).to.eq(REFUND_AMOUNT);
      });
    });
  });

  describe("Ether", () => {
    describe("Donor balance", () => {
      let _grantFromDonorWithEther: Contract;
      const FUNDING_AMOUNT = 1e3;
      const REFUND_AMOUNT = FUNDING_AMOUNT / 2;
      let _grantFromManagerWithEther: Contract;
      let _donorWallet: Wallet;
      let _provider: any;
      let _initialEtherBalance: any;

      before(async () => {
        const { grantFromDonorWithEther, grantFromManagerWithEther, donorWallet, provider } = await waffle.loadFixture(
          fixture
        );

        _grantFromDonorWithEther = grantFromDonorWithEther;
        _grantFromManagerWithEther = grantFromManagerWithEther;
        _donorWallet = donorWallet;
        _provider = provider;

        await donorWallet.sendTransaction({
          to: _grantFromDonorWithEther.address,
          value: 1e6
        });

        _initialEtherBalance = await _provider.getBalance(_donorWallet.address);
      });

      it("should not be updated yet", async () => {
        const etherBalance = await _provider.getBalance(_donorWallet.address);
        expect(_initialEtherBalance).to.eq(etherBalance);

        const { refunded } = await _grantFromManagerWithEther.donors(_donorWallet.address);
        expect(refunded).to.eq(0);
      });

      it("should updated with ether after approve withdraw", async () => {
        await _grantFromManagerWithEther.approveRefund(REFUND_AMOUNT, AddressZero);
        await _grantFromManagerWithEther.withdrawRefund(_donorWallet.address);

        const { refunded } = await _grantFromManagerWithEther.donors(_donorWallet.address);
        expect(refunded).to.eq(REFUND_AMOUNT);

        const etherBalanceAfterRefunding = await _provider.getBalance(_donorWallet.address);
        expect(_initialEtherBalance.add(REFUND_AMOUNT)).to.eq(etherBalanceAfterRefunding);
      });
    });
  });
});
