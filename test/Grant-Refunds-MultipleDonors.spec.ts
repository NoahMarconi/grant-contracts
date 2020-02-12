import Grant from "../build/Grant.json";
import GrantToken from "../build/GrantToken.json";
import chai from "chai";
import * as waffle from "ethereum-waffle";
import { Contract, Wallet, constants } from "ethers";
import { BigNumber } from "ethers/utils/bignumber";
import { AddressZero } from "ethers/constants";
import { before } from "mocha";

chai.use(waffle.solidity);
const { expect } = chai;

describe("Grant", () => {
  describe("With multiple donors & grantee", () => {
    const FUND_AMOUNT = 1e3;
    const REFUND_AMOUNT = FUND_AMOUNT;
    const AMOUNTS = [1e3, 1e3];
    const TARGET_FUNDING = AMOUNTS.reduce((a, b) => a + b, 0);

    async function fixtureForMoreDonors(provider: any, wallets: Wallet[]) {
      const [granteeWallet, secondGranteeWallet, donorWallet, secondDonorWallet, managerWallet] = wallets;
      let balance = await provider.getBalance(donorWallet.address);
      // console.log(`balance  ${balance}`);

      const GRANTEE_ADDRESSES = [granteeWallet.address, secondGranteeWallet.address];

      const currentTime = (await provider.getBlock(await provider.getBlockNumber())).timestamp;

      const token: Contract = await waffle.deployContract(donorWallet, GrantToken, ["Grant Token", "GT", 18]);

      const tokenFromSecondDonor: Contract = new Contract(token.address, GrantToken.abi, secondDonorWallet);

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

      const grantFromDonor: Contract = new Contract(grantWithToken.address, Grant.abi, donorWallet);

      const grantFromSecondDonor: Contract = new Contract(grantWithToken.address, Grant.abi, secondDonorWallet);

      const grantFromManager: Contract = new Contract(grantWithToken.address, Grant.abi, managerWallet);

      const grantWithEther: Contract = await waffle.deployContract(
        granteeWallet,
        Grant,
        [
          GRANTEE_ADDRESSES,
          AMOUNTS,
          managerWallet.address,
          AddressZero,
          TARGET_FUNDING,
          currentTime + 86400,
          currentTime + 86400 * 2
        ],
        { gasLimit: 6e6 }
      );

      const grantFromDonorWithEther: Contract = new Contract(grantWithEther.address, Grant.abi, donorWallet);
      const grantFromSecondDonorWithEther: Contract = new Contract(
        grantWithEther.address,
        Grant.abi,
        secondDonorWallet
      );
      const grantFromManagerWithEther: Contract = new Contract(grantWithEther.address, Grant.abi, managerWallet);

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
        grantFromDonorWithEther,
        grantFromSecondDonorWithEther,
        grantFromManagerWithEther,
        fundingExpiration: currentTime + 86400,
        contractExpiration: currentTime + 86400 * 2,
        provider
      };
    }

    describe("Handling correct dilution for payout -> refund -> payout -> refund -> refund", () => {
      let _grantFromDonor: Contract, _grantFromSecondDonor: Contract, _grantFromManager: Contract, _token: Contract;

      let _donorWallet: Wallet, _secondDonorWallet: Wallet, _granteeWallet: Wallet, _secondGranteeWallet: Wallet;

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
          secondGranteeWallet
        } = await waffle.loadFixture(fixtureForMoreDonors);

        _grantFromDonor = grantFromDonor;
        _grantFromSecondDonor = grantFromSecondDonor;
        _donorWallet = donorWallet;
        _secondDonorWallet = secondDonorWallet;
        _grantFromManager = grantFromManager;
        _granteeWallet = granteeWallet;
        _secondGranteeWallet = secondGranteeWallet;
        _token = token;

        await token.approve(grantFromDonor.address, 1e6);
        await tokenFromSecondDonor.approve(grantFromSecondDonor.address, 1e6);
      });

      it("should update balances of donor & grant on funding", async () => {
        // funding by multiple donors
        const balanceBeforeFundingForGrant = await _token.balanceOf(_grantFromManager.address);

        const balanceBeforeFundingForDonor = await _token.balanceOf(_donorWallet.address);

        await _grantFromDonor.fund(FUND_AMOUNT);
        await _grantFromSecondDonor.fund(FUND_AMOUNT);

        const balanceAfterFundingForGrant = await _token.balanceOf(_grantFromManager.address);

        const balanceAfterFundingForDonor = await _token.balanceOf(_donorWallet.address);

        // console.log(`Grant - balanceBefore ${balanceBeforeFundingForGrant}
        //   balance after ${balanceAfterFundingForGrant}`);
        // console.log(`First Donor - balanceBefore ${balanceBeforeFundingForDonor}
        //   balance after ${balanceAfterFundingForDonor}`);

        expect(FUND_AMOUNT * 2).to.eq(balanceAfterFundingForGrant);
        expect(balanceBeforeFundingForDonor).to.eq(balanceAfterFundingForDonor.add(FUND_AMOUNT));
      });

      it("should update total refunded on approval of refunding", async () => {
        const totalRefundedBeforeApproveRefund = await _grantFromManager.totalRefunded();
        await _grantFromManager.approveRefund(REFUND_AMOUNT, AddressZero);
        const totalRefundedAfterApproveRefund = await _grantFromManager.totalRefunded();
        // console.log(`totalRefundedBeforeApproveRefund ${totalRefundedBeforeApproveRefund},
        // totalRefundedAfterApproveRefund ${totalRefundedAfterApproveRefund}`);
        expect(totalRefundedBeforeApproveRefund.add(REFUND_AMOUNT)).to.eq(totalRefundedAfterApproveRefund);
      });

      it("should update balance of donor and grant on withdraw refund to multiple donors", async () => {
        const balanceBeforeRefundForGrant = await _token.balanceOf(_grantFromManager.address);

        // first donor
        let balanceBeforeRefundForDonor = await _token.balanceOf(_donorWallet.address);
        await _grantFromDonor.withdrawRefund(_donorWallet.address);
        let balanceAfterRefundForDonor = await _token.balanceOf(_donorWallet.address);
        expect(balanceBeforeRefundForDonor.add(5e2)).to.eq(balanceAfterRefundForDonor);

        // second donor
        balanceBeforeRefundForDonor = await _token.balanceOf(_secondDonorWallet.address);
        await _grantFromDonor.withdrawRefund(_secondDonorWallet.address);
        balanceAfterRefundForDonor = await _token.balanceOf(_secondDonorWallet.address);
        expect(balanceBeforeRefundForDonor.add(5e2)).to.eq(balanceAfterRefundForDonor);

        const balanceAfterRefundForGrant = await _token.balanceOf(_grantFromManager.address);

        expect(balanceBeforeRefundForGrant.sub(REFUND_AMOUNT)).to.eq(balanceAfterRefundForGrant);
      });

      it("should update balances of grantees and Grant on payout to multiple grantee", async () => {
        const balanceBeforePayoutForGrant = await _token.balanceOf(_grantFromManager.address);

        let balanceBeforePayoutForDonor = await _token.balanceOf(_granteeWallet.address);
        await _grantFromManager.approvePayout(5e2, _granteeWallet.address);
        let balanceAfterPayoutForDonor = await _token.balanceOf(_granteeWallet.address);
        expect(balanceBeforePayoutForDonor.add(5e2)).to.eq(balanceAfterPayoutForDonor);

        balanceBeforePayoutForDonor = await _token.balanceOf(_secondGranteeWallet.address);
        await _grantFromManager.approvePayout(5e2, _secondGranteeWallet.address);
        balanceAfterPayoutForDonor = await _token.balanceOf(_secondGranteeWallet.address);
        expect(balanceBeforePayoutForDonor.add(5e2)).to.eq(balanceAfterPayoutForDonor);

        const balanceAfterPayoutForGrant = await _token.balanceOf(_grantFromManager.address);

        expect(balanceBeforePayoutForGrant.sub(5e2).sub(5e2)).to.eq(balanceAfterPayoutForGrant);
      });

      it("should update balances of donor & grant on funding again", async () => {
        const DONOR_FUNDING = 1e3 + 1;

        const totalFunding = await _grantFromManager.totalFunding();
        const totalRefunded = await _grantFromManager.totalRefunded();
        // console.log(
        //   `totalFunding ${totalFunding}, targetFunding ${TARGET_FUNDING}, totalRefunded ${totalRefunded}`
        // );

        let newTotalFunding = totalFunding.sub(totalRefunded).add(DONOR_FUNDING);

        const CHANGE = newTotalFunding > TARGET_FUNDING ? newTotalFunding.sub(TARGET_FUNDING) : 0;
        // console.log(
        //   `change ${CHANGE},  donorFunding - change = ${DONOR_FUNDING - CHANGE}`
        // );

        const balanceBeforeFundForGrant = await _token.balanceOf(_grantFromManager.address);

        const balanceBeforeFundForDonor = await _token.balanceOf(_donorWallet.address);

        // funding by donor
        await expect(_grantFromDonor.fund(DONOR_FUNDING))
          .to.emit(_grantFromDonor, "LogFunding")
          .withArgs(_donorWallet.address, DONOR_FUNDING - CHANGE);

        // const { funded, refunded } = await _grantFromManager.donors(
        //   _donorWallet.address
        // );
        // console.log(`Funded ${funded}, refunded ${refunded}`);

        const balanceAfterFundForGrant = await _token.balanceOf(_grantFromManager.address);

        const balanceAfterFundForDonor = await _token.balanceOf(_donorWallet.address);

        // console.log(
        //   `For donor, balanceBeforeFundForDonor ${balanceBeforeFundForDonor}, balanceAfterFundForDonor ${balanceAfterFundForDonor}`
        // );

        expect(balanceBeforeFundForDonor.sub(DONOR_FUNDING - CHANGE)).to.eq(balanceAfterFundForDonor);

        // console.log(
        //   `For Grant - balanceBeforeFund ${balanceBeforeFundForGrant}, balanceAfterFund ${balanceAfterFundForGrant}`
        // );

        expect(balanceBeforeFundForGrant.add(DONOR_FUNDING - CHANGE)).to.eq(balanceAfterFundForGrant);
      });

      it("should update balance of donor and grant on withdraw refund to first donor", async () => {
        // const _PARTIAL_REFUND_AMOUNT = 5e2;
        const _REFUND_AMOUNT = 1e3;

        const totalFunding = await _grantFromManager.totalFunding();
        const totalRefunded = await _grantFromManager.totalRefunded();

        console.log(`totalFunding ${totalFunding},  totalRefunded ${totalRefunded}`);

        const balanceBeforeRefundForGrant = await _token.balanceOf(_grantFromManager.address);

        // refunding by first donor and balance calculations
        let balanceBeforeRefundForDonor = await _token.balanceOf(_donorWallet.address);
        await _grantFromDonor.withdrawRefund(_donorWallet.address);
        let balanceAfterRefundForDonor = await _token.balanceOf(_donorWallet.address);
        // expect(balanceBeforeRefundForDonor.add(_REFUND_AMOUNT)).to.eq(
        //   balanceAfterRefundForDonor
        // );

        console.log(`For Donor - balance before ${balanceBeforeRefundForDonor},  after ${balanceAfterRefundForDonor}`);

        const balanceAfterRefundForGrant = await _token.balanceOf(_grantFromManager.address);

        console.log(
          `For Grant - balanceBeforeRefund ${balanceBeforeRefundForGrant},  balanceAfterRefunds ${balanceAfterRefundForGrant}`
        );

        const { funded, refunded } = await _grantFromManager.donors(_donorWallet.address);
        console.log(`funded ${funded}, refunded ${refunded}`);

        expect(balanceBeforeRefundForGrant.sub(_REFUND_AMOUNT)).to.eq(balanceAfterRefundForGrant);
      });
    });

    describe("Refunding - Approve & Withdraw", () => {
      describe("With Token - total funding by both donors at once", () => {
        let _token: Contract, _grantFromDonor: Contract, _grantFromSecondDonor: Contract, _grantFromManager: Contract;
        let _donorWallet: Wallet, _secondDonorWallet: Wallet;
        let lastRefundOfDonor: BigNumber, lastRefundOfSecondDonor: BigNumber;
        let tokenBalanceOfDonor: BigNumber, tokenBalanceOfSecondDonor: BigNumber;

        before(async () => {
          const {
            token,
            tokenFromSecondDonor,
            grantFromDonor,
            grantFromSecondDonor,
            grantFromManager,
            donorWallet,
            secondDonorWallet
          } = await waffle.loadFixture(fixtureForMoreDonors);

          _grantFromDonor = grantFromDonor;
          _grantFromSecondDonor = grantFromSecondDonor;
          _donorWallet = donorWallet;
          _secondDonorWallet = secondDonorWallet;
          _grantFromManager = grantFromManager;
          _token = token;

          await token.approve(grantFromDonor.address, 1e6);
          await tokenFromSecondDonor.approve(grantFromSecondDonor.address, 1e6);

          await _grantFromDonor.fund(1e3);
          await _grantFromSecondDonor.fund(1e3);

          let { refunded: _lastRefundOfDonor } = await _grantFromManager.donors(_donorWallet.address);
          let { refunded: _lastRefundOfSecondDonor } = await _grantFromManager.donors(_secondDonorWallet.address);
          lastRefundOfDonor = _lastRefundOfDonor;
          lastRefundOfSecondDonor = _lastRefundOfSecondDonor;

          tokenBalanceOfDonor = await _token.balanceOf(_donorWallet.address);
          tokenBalanceOfSecondDonor = await _token.balanceOf(_secondDonorWallet.address);
        });
        it("should be refunded with initial amount", async () => {
          await _grantFromManager.approveRefund(1e3, AddressZero);

          await _grantFromManager.withdrawRefund(_donorWallet.address);
          await _grantFromManager.withdrawRefund(_secondDonorWallet.address);

          // Checking current refund balance
          let { refunded: _lastRefundOfDonor } = await _grantFromManager.donors(_donorWallet.address);
          let { refunded: _lastRefundOfSecondDonor } = await _grantFromManager.donors(_secondDonorWallet.address);

          expect(lastRefundOfDonor.add(500)).to.be.eq(_lastRefundOfDonor);
          expect(lastRefundOfSecondDonor.add(500)).to.be.eq(_lastRefundOfSecondDonor);

          // Checking current token balance
          let _tokenBalanceOfDonor = await _token.balanceOf(_donorWallet.address);
          let _tokenBalanceOfSecondDonor = await _token.balanceOf(_secondDonorWallet.address);

          expect(tokenBalanceOfDonor.add(500)).to.be.eq(_tokenBalanceOfDonor);
          expect(tokenBalanceOfSecondDonor.add(500)).to.be.eq(_tokenBalanceOfSecondDonor);

          // Initializing token and refund balances for next test case.
          tokenBalanceOfDonor = _tokenBalanceOfDonor;
          tokenBalanceOfSecondDonor = _tokenBalanceOfSecondDonor;

          lastRefundOfDonor = _lastRefundOfDonor;
          lastRefundOfSecondDonor = _lastRefundOfSecondDonor;
        });

        it("should be refunded with partial amount", async () => {
          await _grantFromManager.approveRefund(500, AddressZero);

          await _grantFromManager.withdrawRefund(_donorWallet.address);
          await _grantFromManager.withdrawRefund(_secondDonorWallet.address);

          // Checking current refund balance
          let { refunded: _lastRefundOfDonor } = await _grantFromManager.donors(_donorWallet.address);
          let { refunded: _lastRefundOfSecondDonor } = await _grantFromManager.donors(_secondDonorWallet.address);

          expect(lastRefundOfDonor.add(250)).to.be.eq(_lastRefundOfDonor);
          expect(lastRefundOfSecondDonor.add(250)).to.be.eq(_lastRefundOfSecondDonor);

          // Checking current token balance
          let _tokenBalanceOfDonor = await _token.balanceOf(_donorWallet.address);
          let _tokenBalanceOfSecondDonor = await _token.balanceOf(_secondDonorWallet.address);

          expect(tokenBalanceOfDonor.add(250)).to.be.eq(_tokenBalanceOfDonor);
          expect(tokenBalanceOfSecondDonor.add(250)).to.be.eq(_tokenBalanceOfSecondDonor);

          // Initializing token and refund balances for next test case.
          tokenBalanceOfDonor = _tokenBalanceOfDonor;
          tokenBalanceOfSecondDonor = _tokenBalanceOfSecondDonor;

          lastRefundOfDonor = _lastRefundOfDonor;
          lastRefundOfSecondDonor = _lastRefundOfSecondDonor;
        });

        it("should be refunded with final amount", async () => {
          await _grantFromManager.approveRefund(500, AddressZero);

          await _grantFromManager.withdrawRefund(_donorWallet.address);
          await _grantFromManager.withdrawRefund(_secondDonorWallet.address);

          // Checking current refund balance.
          let { refunded: _lastRefundOfDonor } = await _grantFromManager.donors(_donorWallet.address);
          let { refunded: _lastRefundOfSecondDonor } = await _grantFromManager.donors(_secondDonorWallet.address);

          expect(lastRefundOfDonor.add(250)).to.be.eq(_lastRefundOfDonor);
          expect(lastRefundOfSecondDonor.add(250)).to.be.eq(_lastRefundOfSecondDonor);

          // Checking current token balance check
          let _tokenBalanceOfDonor = await _token.balanceOf(_donorWallet.address);
          let _tokenBalanceOfSecondDonor = await _token.balanceOf(_secondDonorWallet.address);

          expect(tokenBalanceOfDonor.add(250)).to.be.eq(_tokenBalanceOfDonor);
          expect(tokenBalanceOfSecondDonor.add(250)).to.be.eq(_tokenBalanceOfSecondDonor);

          // Initializing token and refund balances for next test case.
          tokenBalanceOfDonor = _tokenBalanceOfDonor;
          tokenBalanceOfSecondDonor = _tokenBalanceOfSecondDonor;

          lastRefundOfDonor = _lastRefundOfDonor;
          lastRefundOfSecondDonor = _lastRefundOfSecondDonor;
        });
      });

      describe("With Ether - total funding by both donors at once", () => {
        let _grantFromDonorWithEther: Contract,
          _grantFromSecondDonorWithEther: Contract,
          _grantFromManagerWithEther: Contract;
        let _donorWallet: Wallet, _secondDonorWallet: Wallet;
        let lastRefundOfDonor: BigNumber, lastRefundOfSecondDonor: BigNumber;
        let etherBalanceOfDonor: BigNumber, etherBalanceOfSecondDonor: BigNumber;
        let _provider: any;

        before(async () => {
          const {
            donorWallet,
            secondDonorWallet,
            grantFromDonorWithEther,
            grantFromSecondDonorWithEther,
            grantFromManagerWithEther,
            provider
          } = await waffle.loadFixture(fixtureForMoreDonors);

          _donorWallet = donorWallet;
          _secondDonorWallet = secondDonorWallet;
          _grantFromDonorWithEther = grantFromDonorWithEther;
          _grantFromSecondDonorWithEther = grantFromSecondDonorWithEther;
          _grantFromManagerWithEther = grantFromManagerWithEther;
          _provider = provider;

          // Initial Ether Funding
          await _donorWallet.sendTransaction({ to: grantFromDonorWithEther.address, value: 1e3, gasPrice: 1 });
          await _secondDonorWallet.sendTransaction({ to: grantFromDonorWithEther.address, value: 1e3, gasPrice: 1 });

          let { refunded: _lastRefundOfDonor } = await _grantFromManagerWithEther.donors(_donorWallet.address);
          let { refunded: _lastRefundOfSecondDonor } = await _grantFromManagerWithEther.donors(
            _secondDonorWallet.address
          );

          lastRefundOfDonor = _lastRefundOfDonor;
          lastRefundOfSecondDonor = _lastRefundOfSecondDonor;

          etherBalanceOfDonor = await _provider.getBalance(_donorWallet.address);
          etherBalanceOfSecondDonor = await _provider.getBalance(_secondDonorWallet.address);
        });

        it("should be refunded with initial amount", async () => {
          await _grantFromManagerWithEther.approveRefund(1e3, AddressZero);

          const receiptForDonor = await (
            await _grantFromDonorWithEther.withdrawRefund(_donorWallet.address, { gasPrice: 1 })
          ).wait();
          const receiptForSecondDonor = await (
            await _grantFromSecondDonorWithEther.withdrawRefund(_secondDonorWallet.address, { gasPrice: 1 })
          ).wait();

          // Checking current refund balance
          let { refunded: _lastRefundOfDonor } = await _grantFromManagerWithEther.donors(_donorWallet.address);
          let { refunded: _lastRefundOfSecondDonor } = await _grantFromManagerWithEther.donors(
            _secondDonorWallet.address
          );

          expect(lastRefundOfDonor.add(500)).to.be.eq(_lastRefundOfDonor);
          expect(lastRefundOfSecondDonor.add(500)).to.be.eq(_lastRefundOfSecondDonor);

          // Checking current ether balance
          let _etherBalanceOfDonor = await _provider.getBalance(_donorWallet.address);
          let _etherBalanceOfSecondDonor = await _provider.getBalance(_secondDonorWallet.address);

          expect(etherBalanceOfDonor.add(500).sub(receiptForDonor.gasUsed)).to.be.eq(_etherBalanceOfDonor);
          expect(etherBalanceOfSecondDonor.add(500).sub(receiptForSecondDonor.gasUsed)).to.be.eq(
            _etherBalanceOfSecondDonor
          );

          // Initializing ether and refund balances for next test case.
          etherBalanceOfDonor = _etherBalanceOfDonor;
          etherBalanceOfSecondDonor = _etherBalanceOfSecondDonor;

          lastRefundOfDonor = _lastRefundOfDonor;
          lastRefundOfSecondDonor = _lastRefundOfSecondDonor;
        });

        it("should be refunded with partial amount", async () => {
          await _grantFromManagerWithEther.approveRefund(500, AddressZero);

          const receiptForDonor = await (
            await _grantFromDonorWithEther.withdrawRefund(_donorWallet.address, { gasPrice: 1 })
          ).wait();
          const receiptForSecondDonor = await (
            await _grantFromSecondDonorWithEther.withdrawRefund(_secondDonorWallet.address, { gasPrice: 1 })
          ).wait();

          // Checking current refund balance
          let { refunded: _lastRefundOfDonor } = await _grantFromManagerWithEther.donors(_donorWallet.address);
          let { refunded: _lastRefundOfSecondDonor } = await _grantFromManagerWithEther.donors(
            _secondDonorWallet.address
          );

          expect(lastRefundOfDonor.add(250)).to.be.eq(_lastRefundOfDonor);
          expect(lastRefundOfSecondDonor.add(250)).to.be.eq(_lastRefundOfSecondDonor);

          // Checking current ether balance
          let _etherBalanceOfDonor = await _provider.getBalance(_donorWallet.address);
          let _etherBalanceOfSecondDonor = await _provider.getBalance(_secondDonorWallet.address);

          expect(etherBalanceOfDonor.add(250).sub(receiptForDonor.gasUsed)).to.be.eq(_etherBalanceOfDonor);
          expect(etherBalanceOfSecondDonor.add(250).sub(receiptForSecondDonor.gasUsed)).to.be.eq(
            _etherBalanceOfSecondDonor
          );

          // Initializing ether and refund balances for next test case.
          etherBalanceOfDonor = _etherBalanceOfDonor;
          etherBalanceOfSecondDonor = _etherBalanceOfSecondDonor;

          lastRefundOfDonor = _lastRefundOfDonor;
          lastRefundOfSecondDonor = _lastRefundOfSecondDonor;
        });

        it("should be refunded with final amount", async () => {
          await _grantFromManagerWithEther.approveRefund(300, AddressZero);

          const receiptForDonor = await (
            await _grantFromDonorWithEther.withdrawRefund(_donorWallet.address, { gasPrice: 1 })
          ).wait();
          const receiptForSecondDonor = await (
            await _grantFromSecondDonorWithEther.withdrawRefund(_secondDonorWallet.address, { gasPrice: 1 })
          ).wait();

          // Checking current refund balance
          let { refunded: _lastRefundOfDonor } = await _grantFromManagerWithEther.donors(_donorWallet.address);
          let { refunded: _lastRefundOfSecondDonor } = await _grantFromManagerWithEther.donors(
            _secondDonorWallet.address
          );

          expect(lastRefundOfDonor.add(150)).to.be.eq(_lastRefundOfDonor);
          expect(lastRefundOfSecondDonor.add(150)).to.be.eq(_lastRefundOfSecondDonor);

          // Checking current ether balance
          let _etherBalanceOfDonor = await _provider.getBalance(_donorWallet.address);
          let _etherBalanceOfSecondDonor = await _provider.getBalance(_secondDonorWallet.address);

          expect(etherBalanceOfDonor.add(150).sub(receiptForDonor.gasUsed)).to.be.eq(_etherBalanceOfDonor);
          expect(etherBalanceOfSecondDonor.add(150).sub(receiptForSecondDonor.gasUsed)).to.be.eq(
            _etherBalanceOfSecondDonor
          );

          // Initializing ether and refund balances for next test case.
          etherBalanceOfDonor = _etherBalanceOfDonor;
          etherBalanceOfSecondDonor = _etherBalanceOfSecondDonor;

          lastRefundOfDonor = _lastRefundOfDonor;
          lastRefundOfSecondDonor = _lastRefundOfSecondDonor;
        });
      });
    });
  });
});
