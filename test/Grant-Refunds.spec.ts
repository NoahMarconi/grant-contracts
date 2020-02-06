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
    const currentTime = (
      await provider.getBlock(await provider.getBlockNumber())
    ).timestamp;
    const [
      granteeWallet,
      donorWallet,
      managerWallet,
      secondDonorWallet,
      unknownWallet
    ] = wallets;
    const token: Contract = await waffle.deployContract(
      donorWallet,
      GrantToken,
      ["Grant Token", "GT", 18]
    );
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
    const grantFactory: Contract = await waffle.deployContract(
      donorWallet,
      GrantFactory,
      undefined,
      { gasLimit: 6e6 }
    );

    // Initial token balance.
    await token.mint(donorWallet.address, 1e6);

    const grantFromDonor: Contract = new Contract(
      grantWithToken.address,
      Grant.abi,
      donorWallet
    );
    const grantFromDonorWithEther: Contract = new Contract(
      grantWithEther.address,
      Grant.abi,
      donorWallet
    );
    const grantFromManager: Contract = new Contract(
      grantWithToken.address,
      Grant.abi,
      managerWallet
    );
    const grantFromManagerWithEther: Contract = new Contract(
      grantWithEther.address,
      Grant.abi,
      managerWallet
    );

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
        const {
          token,
          grantFromDonor,
          grantFromManager,
          donorWallet,
          unknownWallet
        } = await waffle.loadFixture(fixture);

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

      before(async () => {
        const {
          token,
          grantFromDonor,
          grantFromManager
        } = await waffle.loadFixture(fixture);
        _grantFromDonor = grantFromDonor;
        _grantFromManager = grantFromManager;

        await token.approve(grantFromDonor.address, 1000);
        await _grantFromDonor.fund(_fundAmount);
      });

      it("should revert if called by non manager", async () => {
        await expect(
          _grantFromDonor.approveRefund(_fundAmount, AddressZero)
        ).to.be.revertedWith(
          "onlyManager::Permission Error. Function can only be called by manager."
        );
      });

      it("should revert if amount > availableBalance", async () => {
        await expect(
          _grantFromManager.approveRefund(_fundAmount + 1, AddressZero)
        ).to.be.revertedWith(
          "approveRefund::Invalid Argument. Amount is greater than Available Balance."
        );
      });
    });

    describe("When approve refunding not done by manager", () => {
      let _grantFromDonor: Contract;
      const _fundAmount = 500;
      let _grantFromManager: Contract;
      let _donorWallet: Wallet;

      before(async () => {
        const {
          token,
          grantFromDonor,
          grantFromManager,
          donorWallet
        } = await waffle.loadFixture(fixture);

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

        const { refunded } = await _grantFromManager.donors(
          _donorWallet.address
        );
        expect(refunded).to.eq(0);
      });
    });

    describe("Donor balance", () => {
      let _grantFromDonor: Contract;
      const _fundAmount = 500;
      let _grantFromManager: Contract;
      let _donorWallet: Wallet;
      let _token: Contract;
      let _tokenBalanceAfterFunding: any;

      before(async () => {
        const {
          token,
          grantFromDonor,
          grantFromManager,
          donorWallet
        } = await waffle.loadFixture(fixture);

        _grantFromDonor = grantFromDonor;
        _grantFromManager = grantFromManager;
        _donorWallet = donorWallet;
        _token = token;

        await token.approve(grantFromDonor.address, 1000);

        await _grantFromDonor.fund(_fundAmount);

        _tokenBalanceAfterFunding = await _token.balanceOf(
          _donorWallet.address
        );
      });

      it("should not be updated yet", async () => {
        const tokenBalance = await _token.balanceOf(_donorWallet.address);
        expect(_tokenBalanceAfterFunding).to.eq(tokenBalance);

        const { refunded } = await _grantFromManager.donors(
          _donorWallet.address
        );
        expect(refunded).to.eq(0);
      });

      it("should updated with token after approve withdraw", async () => {
        await _grantFromManager.approveRefund(_fundAmount, AddressZero);
        await _grantFromDonor.withdrawRefund(_donorWallet.address);

        const tokenBalanceAfterRefunding = await _token.balanceOf(
          _donorWallet.address
        );
        expect(_tokenBalanceAfterFunding.add(_fundAmount)).to.eq(
          tokenBalanceAfterRefunding
        );

        const { refunded } = await _grantFromManager.donors(
          _donorWallet.address
        );
        expect(refunded).to.eq(_fundAmount);
      });
    });
  });

  describe("Ether", () => {
    describe("Donor balance", () => {
      let _grantFromDonorWithEther: Contract;
      const _fundAmount = 1e3;
      let _grantFromManagerWithEther: Contract;
      let _donorWallet: Wallet;
      let _provider: any;
      let _initialEtherBalance: any;

      before(async () => {
        const {
          grantFromDonorWithEther,
          grantFromManagerWithEther,
          donorWallet,
          provider
        } = await waffle.loadFixture(fixture);

        _grantFromDonorWithEther = grantFromDonorWithEther;
        _grantFromManagerWithEther = grantFromManagerWithEther;
        _donorWallet = donorWallet;
        _provider = provider;

        // _initialEtherBalance = await _provider.getBalance(_donorWallet.address);
        // console.log(`1. balance ${_initialEtherBalance}`);

        await donorWallet.sendTransaction({
          to: _grantFromDonorWithEther.address,
          value: 1e6
        });

        _initialEtherBalance = await _provider.getBalance(_donorWallet.address);
        //console.log(`1. balance ${_initialEtherBalance}`);
      });

      it("should not be updated yet", async () => {
        const etherBalance = await _provider.getBalance(_donorWallet.address);
        expect(_initialEtherBalance).to.eq(etherBalance);

        const { refunded } = await _grantFromManagerWithEther.donors(
          _donorWallet.address
        );
        expect(refunded).to.eq(0);
      });

      it("should updated with ether after approve withdraw", async () => {
        await _grantFromManagerWithEther.approveRefund(
          _fundAmount,
          AddressZero
        );
        await _grantFromManagerWithEther.withdrawRefund(_donorWallet.address);

        const etherBalanceAfterRefunding = await _provider.getBalance(
          _donorWallet.address
        );
        // console.log(`balance ${etherBalanceAfterRefunding}`);
        //expect(_initialEtherBalance.add(_fundAmount)).to.eq(etherBalanceAfterRefunding);

        const { refunded } = await _grantFromManagerWithEther.donors(
          _donorWallet.address
        );
        expect(refunded).to.eq(_fundAmount);
      });
    });
  });

  describe.only("With multiple donors & grantee", () => {
    const FUND_AMOUNT = 1e3;
    const REFUND_AMOUNT = FUND_AMOUNT;
    const AMOUNTS = [1e3, 1e3];
    const TARGET_FUNDING = AMOUNTS.reduce((a, b) => a + b, 0);

    async function fixtureForMoreDonors(provider: any, wallets: Wallet[]) {
      const [
        granteeWallet,
        secondGranteeWallet,
        donorWallet,
        secondDonorWallet,
        managerWallet
      ] = wallets;

      const GRANTEE_ADDRESSES = [
        granteeWallet.address,
        secondGranteeWallet.address
      ];

      const currentTime = (
        await provider.getBlock(await provider.getBlockNumber())
      ).timestamp;

      const token: Contract = await waffle.deployContract(
        donorWallet,
        GrantToken,
        ["Grant Token", "GT", 18]
      );

      const tokenFromSecondDonor: Contract = new Contract(
        token.address,
        GrantToken.abi,
        secondDonorWallet
      );

      const grantWithToken: Contract = await waffle.deployContract(
        granteeWallet,
        Grant,
        [
          GRANTEE_ADDRESSES,
          AMOUNTS,
          managerWallet.address,
          token.address,
          TARGET_FUNDING,
          currentTime + 86400,
          currentTime + 86400 * 2
        ],
        { gasLimit: 6e6 }
      );

      // Initial token balance.
      await token.mint(donorWallet.address, 1e6);
      await token.mint(secondDonorWallet.address, 1e3);

      const grantFromDonor: Contract = new Contract(
        grantWithToken.address,
        Grant.abi,
        donorWallet
      );

      const grantFromSecondDonor: Contract = new Contract(
        grantWithToken.address,
        Grant.abi,
        secondDonorWallet
      );

      const grantFromManager: Contract = new Contract(
        grantWithToken.address,
        Grant.abi,
        managerWallet
      );

      return {
        grantWithToken,
        grantFromDonor,
        grantFromSecondDonor,
        grantFromManager,
        token,
        tokenFromSecondDonor,
        granteeWallet,
        secondGranteeWallet,
        donorWallet,
        secondDonorWallet,
        managerWallet,
        fundingExpiration: currentTime + 86400,
        contractExpiration: currentTime + 86400 * 2,
        provider,
        GRANTEE_ADDRESSES
      };
    }

    describe("Handling correct dilution for payout -> refund -> payout -> refund -> refund", () => {
      let _grantFromDonor: Contract,
        _grantFromSecondDonor: Contract,
        _grantFromManager: Contract,
        _token: Contract;

      let _donorWallet: Wallet,
        _secondDonorWallet: Wallet,
        _granteeWallet: Wallet,
        _secondGranteeWallet: Wallet;

      let _GRANTEE_ADDRESSES: string[];

      before(async () => {
        const {
          token,
          tokenFromSecondDonor,
          grantFromDonor,
          grantFromSecondDonor,
          grantFromManager,
          donorWallet,
          secondDonorWallet,
          granteeWallet,
          secondGranteeWallet,
          GRANTEE_ADDRESSES
        } = await waffle.loadFixture(fixtureForMoreDonors);

        _grantFromDonor = grantFromDonor;
        _grantFromSecondDonor = grantFromSecondDonor;
        _donorWallet = donorWallet;
        _secondDonorWallet = secondDonorWallet;
        _grantFromManager = grantFromManager;
        _granteeWallet = granteeWallet;
        _secondGranteeWallet = secondGranteeWallet;
        _token = token;
        _GRANTEE_ADDRESSES = GRANTEE_ADDRESSES;

        await token.approve(grantFromDonor.address, 1e6);
        await tokenFromSecondDonor.approve(grantFromSecondDonor.address, 1e6);
      });

      it("should update balances of donor & grant on funding", async () => {
        // funding by multiple donors
        const balanceBeforeFundingForGrant = await _token.balanceOf(
          _grantFromManager.address
        );

        const balanceBeforeFundingForDonor = await _token.balanceOf(
          _donorWallet.address
        );

        await _grantFromDonor.fund(FUND_AMOUNT);
        await _grantFromSecondDonor.fund(FUND_AMOUNT);

        const balanceAfterFundingForGrant = await _token.balanceOf(
          _grantFromManager.address
        );

        const balanceAfterFundingForDonor = await _token.balanceOf(
          _donorWallet.address
        );

        // console.log(`Grant - balanceBefore ${balanceBeforeFundingForGrant}
        //   balance after ${balanceAfterFundingForGrant}`);
        // console.log(`First Donor - balanceBefore ${balanceBeforeFundingForDonor}
        //   balance after ${balanceAfterFundingForDonor}`);

        expect(FUND_AMOUNT * 2).to.eq(balanceAfterFundingForGrant);
        expect(balanceBeforeFundingForDonor).to.eq(
          balanceAfterFundingForDonor.add(FUND_AMOUNT)
        );
      });

      it("should update total refunded on approval of refunding", async () => {
        const totalRefundedBeforeApproveRefund = await _grantFromManager.totalRefunded();
        await _grantFromManager.approveRefund(REFUND_AMOUNT, AddressZero);
        const totalRefundedAfterApproveRefund = await _grantFromManager.totalRefunded();
        // console.log(`totalRefundedBeforeApproveRefund ${totalRefundedBeforeApproveRefund},
        // totalRefundedAfterApproveRefund ${totalRefundedAfterApproveRefund}`);
        expect(totalRefundedBeforeApproveRefund.add(REFUND_AMOUNT)).to.eq(
          totalRefundedAfterApproveRefund
        );
      });

      it("should update balance of donor and grant on withdraw refund to multiple donors", async () => {
        const balanceBeforeRefundForGrant = await _token.balanceOf(
          _grantFromManager.address
        );

        // first donor
        let balanceBeforeRefundForDonor = await _token.balanceOf(
          _donorWallet.address
        );
        await _grantFromDonor.withdrawRefund(_donorWallet.address);
        let balanceAfterRefundForDonor = await _token.balanceOf(
          _donorWallet.address
        );
        expect(balanceBeforeRefundForDonor.add(5e2)).to.eq(
          balanceAfterRefundForDonor
        );

        // second donor
        balanceBeforeRefundForDonor = await _token.balanceOf(
          _secondDonorWallet.address
        );
        await _grantFromDonor.withdrawRefund(_secondDonorWallet.address);
        balanceAfterRefundForDonor = await _token.balanceOf(
          _secondDonorWallet.address
        );
        expect(balanceBeforeRefundForDonor.add(5e2)).to.eq(
          balanceAfterRefundForDonor
        );

        const balanceAfterRefundForGrant = await _token.balanceOf(
          _grantFromManager.address
        );

        expect(balanceBeforeRefundForGrant.sub(REFUND_AMOUNT)).to.eq(
          balanceAfterRefundForGrant
        );
      });

      it("should update balances of grantees and Grant on payout to multiple grantee", async () => {
        const balanceBeforePayoutForGrant = await _token.balanceOf(
          _grantFromManager.address
        );

        let balanceBeforePayoutForDonor = await _token.balanceOf(
          _granteeWallet.address
        );
        await _grantFromManager.approvePayout(5e2, _granteeWallet.address);
        let balanceAfterPayoutForDonor = await _token.balanceOf(
          _granteeWallet.address
        );
        expect(balanceBeforePayoutForDonor.add(5e2)).to.eq(
          balanceAfterPayoutForDonor
        );

        balanceBeforePayoutForDonor = await _token.balanceOf(
          _secondGranteeWallet.address
        );
        await _grantFromManager.approvePayout(
          5e2,
          _secondGranteeWallet.address
        );
        balanceAfterPayoutForDonor = await _token.balanceOf(
          _secondGranteeWallet.address
        );
        expect(balanceBeforePayoutForDonor.add(5e2)).to.eq(
          balanceAfterPayoutForDonor
        );

        const balanceAfterPayoutForGrant = await _token.balanceOf(
          _grantFromManager.address
        );

        expect(balanceBeforePayoutForGrant.sub(5e2).sub(5e2)).to.eq(
          balanceAfterPayoutForGrant
        );
      });

      it("should update balances of donor & grant on funding again", async () => {
        const DONOR_FUNDING = 1e3 + 1;

        const totalFunding = await _grantFromManager.totalFunding();
        const totalRefunded = await _grantFromManager.totalRefunded();
        console.log(
          `totalFunding ${totalFunding}, targetFunding ${TARGET_FUNDING}, totalRefunded ${totalRefunded}`
        );

        let newTotalFunding = totalFunding
          .sub(totalRefunded)
          .add(DONOR_FUNDING);

        const change =
          newTotalFunding > TARGET_FUNDING
            ? newTotalFunding.sub(TARGET_FUNDING)
            : 0;
        console.log(
          `change ${change},  donorFunding - change = ${DONOR_FUNDING - change}`
        );

        const balanceBeforeFundForGrant = await _token.balanceOf(
          _grantFromManager.address
        );

        const balanceBeforeFundForDonor = await _token.balanceOf(
          _donorWallet.address
        );

        // funding by donor
        await expect(_grantFromDonor.fund(DONOR_FUNDING))
          .to.emit(_grantFromDonor, "LogFunding")
          .withArgs(_donorWallet.address, DONOR_FUNDING - change);

        const balanceAfterFundForGrant = await _token.balanceOf(
          _grantFromManager.address
        );

        const balanceAfterFundForDonor = await _token.balanceOf(
          _donorWallet.address
        );

        console.log(
          `For donor, balanceBeforeFundForDonor ${balanceBeforeFundForDonor}, balanceAfterFundForDonor ${balanceAfterFundForDonor}`
        );

        expect(balanceBeforeFundForDonor.add(DONOR_FUNDING - change)).to.eq(
          balanceAfterFundForDonor
        );

        console.log(
          `For Grant - balanceBeforeFund ${balanceBeforeFundForGrant}, balanceAfterFund ${balanceAfterFundForGrant}`
        );

        expect(balanceBeforeFundForGrant.add(DONOR_FUNDING - change)).to.eq(
          balanceAfterFundForGrant
        );
      });

      it("should update balance of donor and grant on withdraw refund to first donor", async () => {
        // const _PARTIAL_REFUND_AMOUNT = 5e2;
        const _REFUND_AMOUNT = 1e3;

        const balanceBeforeRefundForGrant = await _token.balanceOf(
          _grantFromManager.address
        );

        // refunding by first donor and balance calculations
        let balanceBeforeRefundForDonor = await _token.balanceOf(
          _donorWallet.address
        );
        await _grantFromDonor.withdrawRefund(_donorWallet.address);
        let balanceAfterRefundForDonor = await _token.balanceOf(
          _donorWallet.address
        );
        // expect(balanceBeforeRefundForDonor.add(_REFUND_AMOUNT)).to.eq(
        //   balanceAfterRefundForDonor
        // );

        console.log(
          `balance before ${balanceBeforeRefundForDonor},  after ${balanceAfterRefundForDonor}`
        );

        const balanceAfterRefundForGrant = await _token.balanceOf(
          _grantFromManager.address
        );

        console.log(
          `balanceBeforeRefundForGrant ${balanceBeforeRefundForGrant},  balanceAfterRefundForGrant ${balanceAfterRefundForGrant}`
        );

        expect(balanceBeforeRefundForGrant.sub(_REFUND_AMOUNT)).to.eq(
          balanceAfterRefundForGrant
        );
      });
    });
  });
});
