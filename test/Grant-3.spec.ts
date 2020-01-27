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

    //await token.mint(grantFromDonor.address, 1e8);

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
      provider,
      wallets
    };
  }

  describe("Signaling", () => {
    
    const _positiveSupport = true;
    const _negativeSupport = false;

    let _grantFromDonor: Contract;
    let _grantFromDonorWithEther: Contract;
    let _donorAddress: string;
    let _provider: any;
    let _granteeWallet: Wallet;

    let _token: Contract;
      

    before(async () => {
      const {
        grantFromDonor,
        grantFromDonorWithEther,
        token,
        granteeWallet,
        donorWallet,
        provider,
        
      } = await waffle.loadFixture(fixture);
      _donorAddress = donorWallet.address;
      _grantFromDonorWithEther = grantFromDonorWithEther;
      _provider = provider;
      _granteeWallet = granteeWallet;


        _grantFromDonor = grantFromDonor;
        _token = token;
        _provider = provider;
        _granteeWallet = granteeWallet;
    });

    describe.skip("When Ether", () => {
    
      it("should fail if ether sent does not match value arg", async () => {
        await expect(_grantFromDonorWithEther.signal(_positiveSupport, 1e6))
          .to.be.revertedWith("signal::Invalid Argument. value must match msg.value.");
      });

      it("should emit LogSignal event", async () => {
        await expect(_grantFromDonorWithEther.signal(_positiveSupport, 1e6, { value: 1e6 }))
          .to.emit(_grantFromDonorWithEther, "LogSignal")
          .withArgs(_positiveSupport, _donorAddress, constants.AddressZero, 1e6);
      });

      it("sender should have their funds returned", async () => {
        const startingBalance = await _provider.getBalance(_donorAddress);
        // Set gas price to 1 to make it simple to calc gas spent in eth. 
        const receipt = await (await _grantFromDonorWithEther.signal(_positiveSupport, 1e6, { value: 1e6, gasPrice: 1 })).wait();
        const endingBalance = await _provider.getBalance(_donorAddress);
        expect(endingBalance).to.eq(startingBalance.sub(receipt.gasUsed));
      });

      describe.skip("After funding success", () => {
        before(async () => {
          await _grantFromDonorWithEther.fund(10, { value: 10, gasPrice: 1 });
        });

        it("should revert", async () => {
          await expect(_grantFromDonorWithEther.signal(_positiveSupport, 1e6, { value: 1e6 }))
            .to.be.revertedWith("signal::Status Error. Must be GrantStatus.INIT to signal.00");
        });

      });
    });

    describe("When Token", () => {
      // let _grantFromDonor: Contract;
      // let _token: Contract;
      // let _donorAddress: string;
      // let _provider: any;
      // let _granteeWallet: Wallet;

      // before(async () => {
      //   const {
      //     grantFromDonor,
      //     token,
      //     donorWallet,
      //     provider,
      //     granteeWallet
      //   } = await waffle.loadFixture(fixture);
      //   _donorAddress = donorWallet.address;
      //   _grantFromDonor = grantFromDonor;
      //   _token = token;
      //   _provider = provider;
      //   _granteeWallet = granteeWallet;
      // });

      
      it.skip("should fail if tokens no approved", async () => {
        await expect(_grantFromDonor.signal(_positiveSupport, 1))
          .to.be.revertedWith("SafeMath: subtraction overflow");
      });
        

      describe.skip("When approved", async () => {
        
        beforeEach(async () => {
          await _token.approve(_grantFromDonor.address, 1e6);
        });
          
        it("should reject ether signalling for token funded grants", async () => {
          await expect(_grantFromDonor.signal(_positiveSupport, 1e6, { value: 1e6 }))
            .to.be.revertedWith("signal::Currency Error. Cannot send Ether to a token funded grant.");
        });

        it("should emit LogSignal event", async () => {
          await expect(_grantFromDonor.signal(_positiveSupport, 1e6))
            .to.emit(_grantFromDonor, "LogSignal")
            .withArgs(_positiveSupport, _donorAddress, _token.address, 1e6);
        });

        it("sender should have their funds returned", async () => {
          await _grantFromDonor.signal(_positiveSupport, 1e6);
          const endingBalance = await _token.balanceOf(_donorAddress);
          expect(endingBalance).to.eq(1e6);
        });

      });

    });

    describe("Fund Grant", () => {

      let _managerWallet: Wallet;
      let _donorWallet: Wallet;
     // let _grantFromGrantee: Contract;
      let _grantFromDonor: Contract;
     // let _token: Contract;
      let _grantFromManager: Contract;
      let _provider: any;
      let _res: any;
  
      describe("With Ether", () => {
  
        before(async () => {
          const {
            donorWallet,
            managerWallet,
            grantFromDonorWithEther,
            grantFromManagerWithEther,
            provider
          } = await waffle.loadFixture(fixture);
  
          _donorWallet = donorWallet;
          _managerWallet = managerWallet;
          _grantFromDonor = grantFromDonorWithEther;
          _grantFromManager = grantFromManagerWithEther;
          _provider = provider;
        });
  
        describe.skip("when refund received", () => {
         // let _grantFromManager: Contract;
  
          before(async () => {
            const { grantFromManagerWithEther } = await waffle.loadFixture(fixture);
            _grantFromManager = grantFromManagerWithEther;
            
            const transferReceipt = await _donorWallet.sendTransaction({ to: _grantFromManager.address, value: 5000 });
            console.log("Transfer receipt ", JSON.stringify(transferReceipt));
            
            await _grantFromManager.refund(_donorWallet.address);       
          });
  
         // console.log('_grantFromManager '  + _grantFromManager);
          it("should revert if sender has received a refund", async () => {
            // Refund approved.
            let receipt = await expect(_donorWallet.sendTransaction(
              { to: _grantFromManager.address, value: 5000 }
            ));
            //.to.be.reverted;

            console.log("Receipt " + JSON.stringify(receipt));
            
            //.to.be.revertedWith("fund::Error. Cannot fund if previously approved for, or received, refund.00");
            
            // Refund received.
           await _grantFromDonor.refund(_donorWallet.address);
            await expect(_donorWallet.sendTransaction(
              { to: _grantFromManager.address, value: 5000 }
            )).to.be.revertedWith("fund::Error. Cannot fund if previously approved for, or received, refund.");
  
          });
        });
  
        describe.skip("when grant can not be funded", () => {
          let _grantFromDonor: Contract;
  
          before(async () => {
            const { grantFromDonorWithEther } = await waffle.loadFixture(fixture);
            _grantFromDonor = grantFromDonorWithEther;
            let receipt = await _donorWallet.sendTransaction(
              { to: _grantFromDonor.address, value: 10000 }
            );
            //console.log("Receipt " + JSON.stringify(receipt));
            
            expect(await _grantFromDonor.canFund()).to.be.false;
            
            //expect(await _grantFromDonor.grantStatus()).to.be.eq(GrantStatus.SUCCESS);
          });
  
          it.skip("should revert", async () => {
            await expect(_donorWallet.sendTransaction(
              { to: _grantFromDonor.address, value: 10000 }
            )).to.be.revertedWith("fund::Status Error. Must be GrantStatus.INIT to fund.");
          });
          
        });
  
        describe("when grant status is cancelled", () => {
          let _grantFromManager: Contract;
          let _grantFromDonor: Contract;
  
          before(async () => {
            const { grantFromManagerWithEther, grantFromDonorWithEther }
             = await waffle.loadFixture(fixture);
            
            _grantFromManager = grantFromManagerWithEther;
            _grantFromDonor = grantFromDonorWithEther;
          });

          it("should grant not be cancelled by donor", async() => {
            await _managerWallet.sendTransaction(
              { to: _grantFromDonor.address, value: 5000 }
            );
            await expect(_grantFromDonor.cancelGrant())
            .to.be.revertedWith("cancelGrant::Invalid Sender. Sender must be manager or expired.");
          });

          it("should grant be cancelled", async () => {
            await expect(_grantFromManager.cancelGrant())
              .to.emit(_grantFromManager, "LogGrantCancellation")
              .withArgs();
            expect(await _grantFromManager.grantCancelled()).to.be.true;
          });

          it("should grant not be cancelled again", async() => {
            await expect(_grantFromManager.cancelGrant())
              .to.be.revertedWith("cancelGrant::Status Error. Already cancelled.");
          });


          // it("should revert", async () => {  Not Done
        
          //   await expect(_donorWallet.sendTransaction(
          //     { to: _grantFromManager.address, value: 10000 }
          //   )).to.be.revertedWith("fund::Status Error. Must be GrantStatus.INIT to fund.00");
          // });
  
        });
  
        it.skip("should revert if funding expiration passed");
        it.skip("should revert if contract expiration passed");
  
        it.skip("should permit sending to the fallback function", async () => {
          await _donorWallet.sendTransaction(
            { to: _grantFromDonor.address, value: 5000 }
          );
        });
  
        describe.skip("When funding tx complete", () => {
          let _grantFromDonor: Contract;
  
          before(async () => {
            const { grantFromDonorWithEther } = await waffle.loadFixture(fixture);
            _grantFromDonor = grantFromDonorWithEther;
            const balance = await _provider.getBalance(_grantFromDonor.address);
            expect(balance).to.eq(0);
            _res = await (await _grantFromDonor.fund(15000, { value: 15000 })).wait();
          });
  
          it("should emit LogFunding event", async () => {
            const emittedEvent = _res.events[0];
            expect(emittedEvent.event).to.eq("LogFunding");
            expect(emittedEvent.eventSignature).to.eq("LogFunding(address,uint256)");
  
            const { donor, value } = emittedEvent.args;
            expect(donor).to.eq(_donorWallet.address);
            // Only 10000 as change from 15000 was returned.
            expect(value).to.eq(bigNumberify(10000));
          });
  
          it("should emit LogStatusChange event", async () => {
            const emittedEvent = _res.events[1];
            expect(emittedEvent.event).to.eq("LogStatusChange");
            expect(emittedEvent.eventSignature).to.eq("LogStatusChange(uint8)");
            expect(emittedEvent.args).to.include({ grantStatus: GrantStatus.SUCCESS });
          });
  
          describe("Grant data", () => {
  
            it("should update donor mapping", async () => {
  
              const donorStruct = await _grantFromDonor.getDonor(_donorWallet.address);
              const { refundApproved, funded, refunded } = donorStruct;
  
              expect(funded).to.eq(10000);
              expect(refunded).to.eq(0);
              expect(refundApproved).to.eq(0);
            });
  
            it("should update totalFunded", async () => {
              const totalFunded = await _grantFromDonor.totalFunding();
              expect(totalFunded).to.eq(10000);
            });
  
            it("should update grantStatus", async () => {
              const grantStatus = await _grantFromDonor.grantStatus();
              expect(grantStatus).to.eq(GrantStatus.SUCCESS);
            });
            
          });
  
          it("should update the contract balance, with change returned to donor if over funded", async () => {
            const balance = await _provider.getBalance(_grantFromDonor.address);
            expect(balance).to.eq(10000);
          });
        });
      });
  
      describe.skip("With Token", () => {
  
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
  
          before(async () => {
            const {
              grantFromManager,
              token,
              grantFromDonor
            } = await waffle.loadFixture(fixture);
  
            _grantFromManager = grantFromManager;
            _grantFromDonor = grantFromDonor;
  
            await token.approve(grantFromManager.address, 5000);
            await _grantFromDonor.fund(5000);
            await _grantFromManager.refund(_donorWallet.address);          
          });
  
          it("should revert if sender has received a refund", async () => {
            // Refund approved.
            await expect(_grantFromDonor.fund(5000))
              .to.be.revertedWith("fund::Error. Cannot fund if previously approved for, or received, refund.");
            
            // Refund received.
            await _grantFromDonor.refund(_donorWallet.address);
            await expect(_grantFromDonor.fund(5000))
              .to.be.revertedWith("fund::Error. Cannot fund if previously approved for, or received, refund.");
  
          });
        });
  
        describe("when grant status is SUCCESS", () => {
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
  
        describe("when grant status is DONE", () => {
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
        
        it("should revert if funding expiration passed");
        it("should revert if contract expiration passed");
  
        it("should reject ether funding for token funded grants", async () => {
          await expect(_grantFromDonor.fund(1000, { value: 1000 }))
            .to.be.revertedWith("fundWithToken::Currency Error. Cannot send Ether to a token funded grant.");
        });
  
        describe("When funding tx complete", () => {
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
          });
  
          it("should emit LogFunding event", async () => {
            const emittedEvent = _res.events[2];
            expect(emittedEvent.event).to.eq("LogFunding");
            expect(emittedEvent.eventSignature).to.eq("LogFunding(address,uint256)");
  
            const { donor, value } = emittedEvent.args;
            expect(donor).to.eq(_donorWallet.address);
            expect(value).to.eq(bigNumberify(10000));
          });
  
          it("should emit LogStatusChange event", async () => {
            const emittedEvent = _res.events[3];
            expect(emittedEvent.event).to.eq("LogStatusChange");
            expect(emittedEvent.eventSignature).to.eq("LogStatusChange(uint8)");
            expect(emittedEvent.args).to.include({ grantStatus: GrantStatus.SUCCESS });
          });
  
          describe("Grant data", () => {
  
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
  

});
