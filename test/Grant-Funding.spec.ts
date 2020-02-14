import Grant from "../build/Grant.json";
import GrantToken from "../build/GrantToken.json";
import GrantFactory from "../build/GrantFactory.json";
import chai from "chai";
import * as waffle from "ethereum-waffle";
import { Contract, Wallet, constants } from "ethers";
import { BigNumber } from "ethers/utils/bignumber";
import { AddressZero, Zero } from "ethers/constants";
import { before } from "mocha";

chai.use(waffle.solidity);
const { expect } = chai;

describe("Grant", () => {
  describe("When Funding", () => {
    const AMOUNTS = [1000];
    const TARGET_FUNDING = AMOUNTS.reduce((a, b) => a + b, 0);

    async function fixture(provider: any, wallets: Wallet[]) {
      const currentTime = (await provider.getBlock(await provider.getBlockNumber())).timestamp;

      const [granteeWallet, donorWallet, managerWallet] = wallets;

      const token: Contract = await waffle.deployContract(donorWallet, GrantToken, ["Grant Token", "GT", 18]);

      const grantWithToken: Contract = await waffle.deployContract(
        granteeWallet,
        Grant,
        [
          [granteeWallet.address],
          AMOUNTS,
          managerWallet.address,
          token.address,
          TARGET_FUNDING,
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
          AMOUNTS,
          managerWallet.address,
          AddressZero,
          TARGET_FUNDING,
          currentTime + 86400,
          currentTime + 86400 * 2
        ],
        { gasLimit: 6e6 }
      );
      const grantFactory: Contract = await waffle.deployContract(donorWallet, GrantFactory, undefined, {
        gasLimit: 6e6
      });

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
        contractExpiration: currentTime + 86400 * 2,
        provider
      };
    }

    describe("With Ether", () => {
      let _grantFromDonorWithEther: Contract;
      let _grantFromManagerWithEther: Contract;
      let _donorWallet: Wallet;
      let _grantFromDonor: Contract;

      let _fundReceipt: any;
      const _fundAmountAfterFunding = 1e3;

      before(async () => {
        const {
          grantFromDonorWithEther,
          grantFromManagerWithEther,
          donorWallet,
          grantFromDonor
        } = await waffle.loadFixture(fixture);

        _grantFromDonorWithEther = grantFromDonorWithEther;
        _grantFromManagerWithEther = grantFromManagerWithEther;
        _donorWallet = donorWallet;
        _grantFromDonor = grantFromDonor;

        // Donor fund Ether
        _fundReceipt = await (
          await _donorWallet.sendTransaction({ to: _grantFromDonorWithEther.address, value: 1e6 })
        ).wait();
      });

      it("should be funded by donor", async () => {
        expect(await _grantFromDonorWithEther.totalFunding()).to.eq(_fundAmountAfterFunding);
      });

      it("should emit Events", async () => {
        const logFundingEvent: any[] = !_fundReceipt.events
          ? []
          : _fundReceipt.events.filter((event: any) => event.event === "LogFunding");
        for (const event of logFundingEvent) {
          const logFundingEvent = event.eventSignature;
          expect(logFundingEvent).to.eq("LogFunding(address,uint256)");
        }

        const LogFundingCompleteEvent: any[] = !_fundReceipt.events
          ? []
          : _fundReceipt.events.filter((event: any) => event.event === "LogFundingComplete");
        for (const event of LogFundingCompleteEvent) {
          const logFundingEvent = event.eventSignature;
          expect(logFundingEvent).to.eq("LogFundingComplete()");
        }
      });

      it("should donor funding balances == fund amount", async () => {
        const { funded } = await _grantFromDonorWithEther.donors(_donorWallet.address);
        expect(funded).to.eq(_fundAmountAfterFunding);
      });

      it("should grant status to be true", async () => {
        expect(await _grantFromDonor.canFund()).to.be.eq(true);
      });

      // following test case should be last, because Grant is getting cancelled.
      it("should reject funding if grant is already cancelled", async () => {
        await _grantFromManagerWithEther.cancelGrant();
        await expect(
          _donorWallet.sendTransaction({
            to: _grantFromDonorWithEther.address,
            value: 1e6
          })
        ).to.be.revertedWith("fund::Status Error. Grant not open to funding.");
      });

      describe("Funding", () => {
        let _grantFromDonorWithEther: Contract;
        let _donorWallet: Wallet, _managerWallet: Wallet, _granteeWallet: Wallet;

        before(async () => {
          const { grantFromDonorWithEther, donorWallet, managerWallet, granteeWallet } = await waffle.loadFixture(
            fixture
          );

          _grantFromDonorWithEther = grantFromDonorWithEther;
          _donorWallet = donorWallet;
          _managerWallet = managerWallet;
          _granteeWallet = granteeWallet;
        });

        it("should revert on funding zero ether", async () => {
          await expect(
            _donorWallet.sendTransaction({ to: _grantFromDonorWithEther.address, value: Zero })
          ).to.be.revertedWith("fundWithEther::Invalid Value. msg.value be greater than 0.");
        });

        it("should revert on funding by manager", async () => {
          await expect(_managerWallet.sendTransaction({ to: _grantFromDonorWithEther.address, value: 500 })).to.be
            .reverted;
        });

        it("should revert on funding by grantee", async () => {
          await expect(_granteeWallet.sendTransaction({ to: _grantFromDonorWithEther.address, value: 500 })).to.be
            .reverted;
        });
      });
    });

    describe("With Token", () => {
      let _donorWallet: Wallet;
      let _grantFromDonor: Contract;
      let _grantFromManager: Contract;
      const FUND_AMOUNT = 500;
      const REFUND_AMOUNT = 20;
      let _fundReceipt: any;

      before(async () => {
        const { donorWallet, grantFromDonor, token, grantFromManager } = await waffle.loadFixture(fixture);

        _donorWallet = donorWallet;
        _grantFromDonor = grantFromDonor;
        _grantFromManager = grantFromManager;

        await token.approve(grantFromManager.address, 5000);

        // Donor fund Token
        _fundReceipt = await (await _grantFromDonor.fund(FUND_AMOUNT)).wait();
      });

      it("should be funded by donor", async () => {
        expect(await _grantFromDonor.totalFunding()).to.eq(FUND_AMOUNT);
      });

      it("should emit Events", async () => {
        const logFundingEvent: any[] = _fundReceipt.events.filter((event: any) => event.event === "LogFunding");
        for (const event of logFundingEvent) {
          const logFundingEvent = event.eventSignature;
          expect(logFundingEvent).to.eq("LogFunding(address,uint256)");
        }

        const LogFundingCompleteEvent: any[] = _fundReceipt.events.filter(
          (event: any) => event.event == "LogFundingComplete"
        );
        for (const event of LogFundingCompleteEvent) {
          const logFundingEvent = event.eventSignature;
          expect(logFundingEvent).to.eq("LogFundingComplete()");
        }
      });

      it("should donor funding balances == fund amount", async () => {
        const { funded } = await _grantFromDonor.donors(_donorWallet.address);
        expect(funded).to.eq(FUND_AMOUNT);
      });

      it("should grant status to be true", async () => {
        expect(await _grantFromDonor.canFund()).to.be.eq(true);
      });

      it("should reject if donor fund ether for token funded grants", async () => {
        await expect(
          _donorWallet.sendTransaction({ to: _grantFromDonor.address, value: 1e3, gasPrice: 1 })
        ).to.be.revertedWith("fundWithToken::Currency Error. Cannot send Ether to a token funded grant.");
      });

      // following test case should be last, because Grant is getting cancelled.
      it("should reject funding if grant is already cancelled", async () => {
        await _grantFromManager.cancelGrant();
        await expect(_grantFromDonor.fund(FUND_AMOUNT)).to.be.revertedWith(
          "fund::Status Error. Grant not open to funding."
        );
      });
    });
  });

  describe("On Funding, When multiple donors are involved", () => {
    const AMOUNTS = [1000, 500];
    const TARGET_FUNDING = AMOUNTS.reduce((a, b) => a + b, 0);

    async function fixtureWithMultipleGrantee(provider: any, wallets: Wallet[]) {
      const currentTime = (await provider.getBlock(await provider.getBlockNumber())).timestamp;

      const [
        granteeWallet,
        secondGranteeWallet,
        donorWallet,
        secondDonorWallet,
        managerWallet,
        thirdPersonWallet
      ] = wallets;

      const token: Contract = await waffle.deployContract(donorWallet, GrantToken, ["Grant Token", "GT", 18]);

      const grantWithToken: Contract = await waffle.deployContract(
        granteeWallet,
        Grant,
        [
          [granteeWallet.address, secondGranteeWallet.address],
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
      await token.mint(secondDonorWallet.address, 1e6);

      // For token.
      const tokenFromSecondDonor: Contract = new Contract(token.address, GrantToken.abi, secondDonorWallet);

      const grantFromDonor: Contract = new Contract(grantWithToken.address, Grant.abi, donorWallet);

      const grantFromSecondDonor: Contract = new Contract(grantWithToken.address, Grant.abi, secondDonorWallet);

      const grantFromManager: Contract = new Contract(grantWithToken.address, Grant.abi, managerWallet);

      // For ether
      const grantWithEther: Contract = await waffle.deployContract(
        granteeWallet,
        Grant,
        [
          [granteeWallet.address, secondGranteeWallet.address],
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
        thirdPersonWallet,
        grantFromDonorWithEther,
        grantFromSecondDonorWithEther,
        grantFromManagerWithEther,
        provider
      };
    }

    describe("With Token", () => {
      describe("Donors' balance", () => {
        let _grantFromDonor: Contract;
        let _grantFromSecondDonor: Contract;
        let _grantFromManager: Contract;
        let _donorWallet: Wallet;
        let _secondDonorWallet: Wallet;

        let _token: Contract;
        let lastFundingAmountByDonor: BigNumber;
        let lastFundingAmountBySecondDonor: BigNumber;

        let lastBalanceOfGrant: BigNumber;
        let lastBalanceOfDonor: BigNumber;
        let lastBalanceOfSecondDonor: BigNumber;

        before(async () => {
          const {
            token,
            tokenFromSecondDonor,
            grantFromDonor,
            grantFromSecondDonor,
            grantFromManager,
            donorWallet,
            secondDonorWallet
          } = await waffle.loadFixture(fixtureWithMultipleGrantee);

          _token = token;
          _grantFromDonor = grantFromDonor;
          _grantFromSecondDonor = grantFromSecondDonor;
          _grantFromManager = grantFromManager;

          _donorWallet = donorWallet;
          _secondDonorWallet = secondDonorWallet;

          await token.approve(grantFromDonor.address, TARGET_FUNDING);
          await tokenFromSecondDonor.approve(grantFromSecondDonor.address, TARGET_FUNDING);

          // first donor
          const { funded: fundedByDonor } = await _grantFromManager.donors(_donorWallet.address);
          lastFundingAmountByDonor = fundedByDonor;
          lastBalanceOfDonor = await _token.balanceOf(_donorWallet.address);

          // second donor
          const { funded: fundedBySecondDonor } = await _grantFromManager.donors(_secondDonorWallet.address);
          lastFundingAmountBySecondDonor = fundedBySecondDonor;
          lastBalanceOfSecondDonor = await _token.balanceOf(_secondDonorWallet.address);

          // Grant balance
          lastBalanceOfGrant = await _token.balanceOf(_grantFromDonor.address);
        });

        it("should revert with zero funding", async () => {
          await expect(_grantFromDonor.fund(Zero)).to.be.reverted;
        });

        it("should be updated with initial funding", async () => {
          const initialBalanceForGrant = lastBalanceOfGrant;

          let fundingAmount = 5e2;

          // first donor
          const initialBalanceOfDonor = lastBalanceOfDonor;

          await _grantFromDonor.fund(fundingAmount);
          const { funded: fundedByDonor } = await _grantFromManager.donors(_donorWallet.address);
          expect(lastFundingAmountByDonor.add(fundingAmount)).to.be.eq(fundedByDonor);
          lastFundingAmountByDonor = fundedByDonor;

          const finalBalanceOfDonor = await _token.balanceOf(_donorWallet.address);

          expect(initialBalanceOfDonor.sub(fundingAmount)).to.be.eq(finalBalanceOfDonor);
          lastBalanceOfDonor = finalBalanceOfDonor;

          // second donor
          fundingAmount = 250;
          const initialBalanceOfSecondDonor = lastBalanceOfSecondDonor;

          await _grantFromSecondDonor.fund(fundingAmount);

          const { funded: fundedBySecondDonor } = await _grantFromManager.donors(_secondDonorWallet.address);
          expect(lastFundingAmountBySecondDonor.add(fundingAmount)).to.be.eq(fundedBySecondDonor);
          lastFundingAmountBySecondDonor = fundedBySecondDonor;
          const finalBalanceOfSecondDonor = await _token.balanceOf(_secondDonorWallet.address);
          expect(initialBalanceOfSecondDonor.sub(fundingAmount)).to.be.eq(finalBalanceOfSecondDonor);
          lastBalanceOfSecondDonor = finalBalanceOfSecondDonor;

          // Grant's balance
          const finalBalanceOfGrant = await _token.balanceOf(_grantFromDonor.address);
          lastBalanceOfGrant = finalBalanceOfGrant;

          expect(initialBalanceForGrant.add(5e2).add(250)).to.be.eq(finalBalanceOfGrant);
        });

        it("should be updated with final funding", async () => {
          const initialBalanceForGrant = lastBalanceOfGrant;
          let fundingAmount = 250;

          // first donor
          const initialBalanceOfDonor = lastBalanceOfDonor;
          await _grantFromDonor.fund(fundingAmount);
          let { funded: fundedByDonor } = await _grantFromManager.donors(_donorWallet.address);
          expect(lastFundingAmountByDonor.add(fundingAmount)).to.be.eq(fundedByDonor);
          lastFundingAmountByDonor = fundedByDonor;

          const finalBalanceOfDonor = await _token.balanceOf(_donorWallet.address);

          expect(initialBalanceOfDonor.sub(fundingAmount)).to.be.eq(finalBalanceOfDonor);
          lastBalanceOfDonor = finalBalanceOfDonor;

          // second donor
          fundingAmount = 500;
          const initialBalanceOfSecondDonor = lastBalanceOfSecondDonor;

          await _grantFromSecondDonor.fund(fundingAmount);

          let { funded: fundedBySecondDonor } = await _grantFromManager.donors(_secondDonorWallet.address);
          expect(lastFundingAmountBySecondDonor.add(fundingAmount)).to.be.eq(fundedBySecondDonor);
          lastFundingAmountBySecondDonor = fundedBySecondDonor;
          const finalBalanceOfSecondDonor = await _token.balanceOf(_secondDonorWallet.address);
          expect(initialBalanceOfSecondDonor.sub(fundingAmount)).to.be.eq(finalBalanceOfSecondDonor);
          lastBalanceOfSecondDonor = finalBalanceOfSecondDonor;

          // Grant' balance
          const finalBalanceOfGrant = await _token.balanceOf(_grantFromDonor.address);
          lastBalanceOfGrant = finalBalanceOfGrant;

          expect(initialBalanceForGrant.add(250).add(500)).to.be.eq(finalBalanceOfGrant);
        });
      });
    });

    describe("With Ether", () => {
      describe("Donors' balance", () => {
        let _grantFromDonorWithEther: Contract;
        let _grantFromSecondDonorWithEther: Contract;
        let _grantFromManagerWithEther: Contract;
        let _donorWallet: Wallet;
        let _secondDonorWallet: Wallet;
        let _provider: any;

        let lastFundingOfDonor: BigNumber,
          lastFundingOfSecondDonor: BigNumber,
          etherBalanceOfDonor: BigNumber,
          etherBalanceOfSecondDonor: BigNumber;

        before(async () => {
          const {
            grantFromDonorWithEther,
            grantFromSecondDonorWithEther,
            grantFromManagerWithEther,
            donorWallet,
            secondDonorWallet,
            provider
          } = await waffle.loadFixture(fixtureWithMultipleGrantee);

          _grantFromDonorWithEther = grantFromDonorWithEther;
          _grantFromSecondDonorWithEther = grantFromSecondDonorWithEther;
          _grantFromManagerWithEther = grantFromManagerWithEther;
          _donorWallet = donorWallet;
          _secondDonorWallet = secondDonorWallet;
          _provider = provider;

          const { funded: _lastFundingOfDonor } = await _grantFromManagerWithEther.donors(_donorWallet.address);
          const { funded: _lastFundingOfSecondDonor } = await _grantFromManagerWithEther.donors(
            _secondDonorWallet.address
          );
          lastFundingOfDonor = _lastFundingOfDonor;
          lastFundingOfSecondDonor = _lastFundingOfSecondDonor;

          etherBalanceOfDonor = await _provider.getBalance(_donorWallet.address);
          etherBalanceOfSecondDonor = await _provider.getBalance(_secondDonorWallet.address);
        });

        it("should be updated with initial funding", async () => {
          const receiptForDonor = await (
            await _donorWallet.sendTransaction({ to: _grantFromDonorWithEther.address, value: 500, gasPrice: 1 })
          ).wait();

          const receiptForSecondDonor = await (
            await _secondDonorWallet.sendTransaction({
              to: _grantFromSecondDonorWithEther.address,
              value: 600,
              gasPrice: 1
            })
          ).wait();

          // Checking current ether balance
          const _etherBalanceOfDonor = await _provider.getBalance(_donorWallet.address);
          const _etherBalanceOfSecondDonor = await _provider.getBalance(_secondDonorWallet.address);

          expect(etherBalanceOfDonor.sub(500).sub(receiptForDonor.gasUsed!)).to.be.eq(_etherBalanceOfDonor);
          expect(etherBalanceOfSecondDonor.sub(600).sub(receiptForSecondDonor.gasUsed!)).to.be.eq(
            _etherBalanceOfSecondDonor
          );

          // Checking current fund balance
          const { funded: _lastFundingOfDonor } = await _grantFromManagerWithEther.donors(_donorWallet.address);
          const { funded: _lastFundingOfSecondDonor } = await _grantFromManagerWithEther.donors(
            _secondDonorWallet.address
          );

          expect(lastFundingOfDonor.add(500)).to.be.eq(_lastFundingOfDonor);
          expect(lastFundingOfSecondDonor.add(600)).to.be.eq(_lastFundingOfSecondDonor);

          // Initializing ether and fund balances for next test case.
          etherBalanceOfDonor = _etherBalanceOfDonor;
          etherBalanceOfSecondDonor = _etherBalanceOfSecondDonor;

          lastFundingOfDonor = _lastFundingOfDonor;
          lastFundingOfSecondDonor = _lastFundingOfSecondDonor;
        });

        it("should be updated with final funding", async () => {
          const receiptForDonor = await (
            await _donorWallet.sendTransaction({ to: _grantFromDonorWithEther.address, value: 300, gasPrice: 1 })
          ).wait();

          const receiptForSecondDonor = await (
            await _secondDonorWallet.sendTransaction({
              to: _grantFromSecondDonorWithEther.address,
              value: 100,
              gasPrice: 1
            })
          ).wait();

          // Checking current ether balance
          const _etherBalanceOfDonor = await _provider.getBalance(_donorWallet.address);
          const _etherBalanceOfSecondDonor = await _provider.getBalance(_secondDonorWallet.address);

          expect(etherBalanceOfDonor.sub(300).sub(receiptForDonor.gasUsed!)).to.be.eq(_etherBalanceOfDonor);
          expect(etherBalanceOfSecondDonor.sub(100).sub(receiptForSecondDonor.gasUsed!)).to.be.eq(
            _etherBalanceOfSecondDonor
          );

          // Checking current fund balance
          const { funded: _lastFundingOfDonor } = await _grantFromManagerWithEther.donors(_donorWallet.address);
          const { funded: _lastFundingOfSecondDonor } = await _grantFromManagerWithEther.donors(
            _secondDonorWallet.address
          );

          expect(lastFundingOfDonor.add(300)).to.be.eq(_lastFundingOfDonor);
          expect(lastFundingOfSecondDonor.add(100)).to.be.eq(_lastFundingOfSecondDonor);

          // Initializing ether and fund balances for next test case.
          etherBalanceOfDonor = _etherBalanceOfDonor;
          etherBalanceOfSecondDonor = _etherBalanceOfSecondDonor;

          lastFundingOfDonor = _lastFundingOfDonor;
          lastFundingOfSecondDonor = _lastFundingOfSecondDonor;
        });
      });
    });
  });
});
