import Grant from "../build/Grant.json";
import GrantToken from "../build/GrantToken.json";
import GrantFactory from "../build/GrantFactory.json";
import chai from "chai";
import * as waffle from "ethereum-waffle";
import { Contract, Wallet } from "ethers";
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
        provider,
        TARGET_FUNDING
      };
    }

    describe("With Ether", () => {
      let _grantFromDonorWithEther: Contract;
      let _grantFromManagerWithEther: Contract;
      let _donorWallet: Wallet;
      let _grantFromDonor: Contract;

      let _fundReceipt: any;
      const FUND_AMOUNT = 1e3;

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

        // Ether funding by donor
        _fundReceipt = await (
          await _donorWallet.sendTransaction({ to: _grantFromDonorWithEther.address, value: FUND_AMOUNT })
        ).wait();
      });

      it("should be funded by donor", async () => {
        expect(await _grantFromDonorWithEther.totalFunding()).to.eq(FUND_AMOUNT);
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

      it("donor's funding balances should equal to fund amount", async () => {
        const { funded } = await _grantFromDonorWithEther.donors(_donorWallet.address);
        expect(funded).to.eq(FUND_AMOUNT);
      });

      it("should grant status to be true", async () => {
        expect(await _grantFromDonor.canFund()).to.be.eq(true);
      });

      // Following test case should be last, because Grant is getting cancelled.
      it("should reject funding if grant is already cancelled", async () => {
        await _grantFromManagerWithEther.cancelGrant();
        await expect(
          _donorWallet.sendTransaction({
            to: _grantFromDonorWithEther.address,
            value: FUND_AMOUNT
          })
        ).to.be.revertedWith("fund::Status Error. Grant not open to funding.");
      });

      describe("Funding", () => {
        let _grantFromDonorWithEther: Contract;
        let _managerWallet: Wallet, _granteeWallet: Wallet;
        let _provider: any;
        let _TARGET_FUNDING: any;

        before(async () => {
          const {
            grantFromDonorWithEther,
            managerWallet,
            granteeWallet,
            provider,
            TARGET_FUNDING
          } = await waffle.loadFixture(fixture);

          _grantFromDonorWithEther = grantFromDonorWithEther;
          _managerWallet = managerWallet;
          _granteeWallet = granteeWallet;
          _provider = provider;
          _TARGET_FUNDING = TARGET_FUNDING;
        });

        it("should revert on funding by manager", async () => {
          await expect(_managerWallet.sendTransaction({ to: _grantFromDonorWithEther.address, value: 100 })).to.be
            .reverted;
        });

        it("should revert on funding by grantee", async () => {
          await expect(_granteeWallet.sendTransaction({ to: _grantFromDonorWithEther.address, value: 100 })).to.be
            .reverted;
        });

        it("should (difference of amount and funding required) sent back to donor, when amount exceeds funding required", async () => {
          const initialFunding = await _grantFromManagerWithEther.totalFunding();
          const initialEtherBalance: any = await _provider.getBalance(_donorWallet.address);

          // Funding by donor
          const receipt = await (
            await _donorWallet.sendTransaction({ to: _grantFromDonorWithEther.address, value: 1200, gasPrice: 1 })
          ).wait();

          const finalEtherBalance = await _provider.getBalance(_donorWallet.address);
          const gasUsed: any = receipt.gasUsed!;
          const etherDeducted = gasUsed.add(_TARGET_FUNDING - initialFunding);

          expect(initialEtherBalance.sub(etherDeducted)).to.be.eq(finalEtherBalance);
        });
      });
    });

    describe("With Token", () => {
      let _donorWallet: Wallet;
      let _grantFromDonor: Contract;
      let _grantFromManager: Contract;
      const FUND_AMOUNT = 500;
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

      it("should emit events", async () => {
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

      it("donor's funding balances should equal to fund amount", async () => {
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
        provider,
        TARGET_FUNDING
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
        let fundedByDonor: BigNumber;
        let fundedBySecondDonor: BigNumber;

        let tokenBalanceOfGrant: BigNumber;
        let tokenBalanceOfDonor: BigNumber;
        let tokenBalanceOfSecondDonor: BigNumber;

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
          const { funded: _fundedByDonor } = await _grantFromManager.donors(_donorWallet.address);
          fundedByDonor = _fundedByDonor;
          tokenBalanceOfDonor = await _token.balanceOf(_donorWallet.address);

          // second donor
          const { funded: _fundedBySecondDonor } = await _grantFromManager.donors(_secondDonorWallet.address);
          fundedBySecondDonor = _fundedBySecondDonor;
          tokenBalanceOfSecondDonor = await _token.balanceOf(_secondDonorWallet.address);

          // Grant balance
          tokenBalanceOfGrant = await _token.balanceOf(_grantFromDonor.address);
        });

        it("should revert with zero funding", async () => {
          await expect(_grantFromDonor.fund(Zero)).to.be.reverted;
        });

        it("should be updated with initial funding", async () => {
          // Funding by first donor
          const FUNDING_AMOUNT_FOR_DONOR = 5e2;
          await _grantFromDonor.fund(FUNDING_AMOUNT_FOR_DONOR);

          // First donor's balances checking
          const { funded: _fundedByDonor } = await _grantFromManager.donors(_donorWallet.address);
          expect(fundedByDonor.add(FUNDING_AMOUNT_FOR_DONOR)).to.be.eq(_fundedByDonor);
          fundedByDonor = _fundedByDonor;

          const _tokenBalanceOfDonor = await _token.balanceOf(_donorWallet.address);
          expect(tokenBalanceOfDonor.sub(FUNDING_AMOUNT_FOR_DONOR)).to.be.eq(_tokenBalanceOfDonor);
          tokenBalanceOfDonor = _tokenBalanceOfDonor;

          // Funding by second donor
          const FUNDING_AMOUNT_FOR_SECOND_DONOR = 250;
          await _grantFromSecondDonor.fund(FUNDING_AMOUNT_FOR_SECOND_DONOR);

          // Second donor's balances checking
          const { funded: _fundedBySecondDonor } = await _grantFromManager.donors(_secondDonorWallet.address);
          expect(fundedBySecondDonor.add(FUNDING_AMOUNT_FOR_SECOND_DONOR)).to.be.eq(_fundedBySecondDonor);
          fundedBySecondDonor = _fundedBySecondDonor;

          const _tokenBalanceOfSecondDonor = await _token.balanceOf(_secondDonorWallet.address);
          expect(tokenBalanceOfSecondDonor.sub(FUNDING_AMOUNT_FOR_SECOND_DONOR)).to.be.eq(_tokenBalanceOfSecondDonor);
          tokenBalanceOfSecondDonor = _tokenBalanceOfSecondDonor;

          // Grant's balance checking
          const _tokenBalanceOfGrant = await _token.balanceOf(_grantFromDonor.address);
          expect(tokenBalanceOfGrant.add(FUNDING_AMOUNT_FOR_DONOR).add(FUNDING_AMOUNT_FOR_SECOND_DONOR)).to.be.eq(
            _tokenBalanceOfGrant
          );
          tokenBalanceOfGrant = _tokenBalanceOfGrant;
        });

        it("should be updated with final funding", async () => {
          // Funding by first donor
          const FUNDING_AMOUNT_FOR_DONOR = 250;
          await _grantFromDonor.fund(FUNDING_AMOUNT_FOR_DONOR);

          // First donor's balances checking
          let { funded: _fundedByDonor } = await _grantFromManager.donors(_donorWallet.address);
          expect(fundedByDonor.add(FUNDING_AMOUNT_FOR_DONOR)).to.be.eq(_fundedByDonor);
          fundedByDonor = _fundedByDonor;

          const _tokenBalanceOfDonor = await _token.balanceOf(_donorWallet.address);
          expect(tokenBalanceOfDonor.sub(FUNDING_AMOUNT_FOR_DONOR)).to.be.eq(_tokenBalanceOfDonor);
          tokenBalanceOfDonor = _tokenBalanceOfDonor;

          // Funding by second donor
          const FUNDING_AMOUNT_FOR_SECOND_DONOR = 500;
          await _grantFromSecondDonor.fund(FUNDING_AMOUNT_FOR_SECOND_DONOR);

          // Second donor's balances checking
          let { funded: _fundedBySecondDonor } = await _grantFromManager.donors(_secondDonorWallet.address);
          expect(fundedBySecondDonor.add(FUNDING_AMOUNT_FOR_SECOND_DONOR)).to.be.eq(_fundedBySecondDonor);
          fundedBySecondDonor = _fundedBySecondDonor;

          const _tokenBalanceOfSecondDonor = await _token.balanceOf(_secondDonorWallet.address);
          expect(tokenBalanceOfSecondDonor.sub(FUNDING_AMOUNT_FOR_SECOND_DONOR)).to.be.eq(_tokenBalanceOfSecondDonor);
          tokenBalanceOfSecondDonor = _tokenBalanceOfSecondDonor;

          // Grant's balance checking
          const _tokenBalanceOfGrant = await _token.balanceOf(_grantFromDonor.address);
          expect(tokenBalanceOfGrant.add(FUNDING_AMOUNT_FOR_DONOR).add(FUNDING_AMOUNT_FOR_SECOND_DONOR)).to.be.eq(
            _tokenBalanceOfGrant
          );
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

        it("should revert on funding zero ether", async () => {
          await expect(
            _donorWallet.sendTransaction({ to: _grantFromDonorWithEther.address, value: Zero, gasPrice: 1 })
          ).to.be.revertedWith("fundWithEther::Invalid Value. msg.value be greater than 0.");

          etherBalanceOfDonor = await _provider.getBalance(_donorWallet.address);
        });

        it("should be updated with initial funding", async () => {
          // Funding by first and second donor
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
          // Funding by first and second donor
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
