import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";


const PRICE = ethers.utils.parseEther("2");
const chunkSize = 10

describe("NFTStaking Tests", function () {
  let rewardsContract: Contract;
  let nftContract: Contract;
  let stakingContract: Contract;
  let contractOwner: SignerWithAddress;
  let buyers: SignerWithAddress[];
  let IDENTITIES: {
    [x: string]: string;
  };

  beforeEach(async () => {
    [contractOwner, ...buyers] = await ethers.getSigners();

    const DAVYRewards = await ethers.getContractFactory(
      "DAVYRewards",
      contractOwner
    );

    rewardsContract = await DAVYRewards.deploy();
    await rewardsContract.deployed();

    const DAVYNFTContract = await ethers.getContractFactory(
      "DAVYNFT",
      contractOwner
    );

    nftContract = await DAVYNFTContract.deploy();
    await nftContract.deployed();

    const NFTStaking = await ethers.getContractFactory(
      "NFTStaking",
      contractOwner
    );

    stakingContract = await NFTStaking.deploy(nftContract.address, rewardsContract.address);
    await stakingContract.deployed();

    nftContract.setStakingContract(stakingContract.address)

    IDENTITIES = {
      [rewardsContract.address]: "REWARDS_CONTRACT_ADDRESS",
      [nftContract.address]: "NFT_CONTRACT_ADDRESS",
      [contractOwner.address]: "CONTRACT_OWNER"
    };

    buyers.forEach((buyer, index) => {
      IDENTITIES[buyer.address] = `BUYER_${index + 1}`
    })

  });

  async function getBlockEarnings(daysToAdd: number, expectedEarnings: BigNumber) {
    const contractStart = new Date(Number(await stakingContract.getContractStart()));
    const newDate = new Date(contractStart);

    newDate.setDate(contractStart.getDate() + daysToAdd);

    const amountInSeconds = (newDate.getTime() - contractStart.getTime()) / 1000;

    await ethers.provider.send("evm_increaseTime", [amountInSeconds]);
    await ethers.provider.send("evm_mine", []);

    const earnings = Math.floor(Number(await stakingContract.getEarningsForEra())) / 1e18;
    const expected = Number(expectedEarnings)/ 1e18
    const err = Math.abs((expected - earnings) / earnings);

    console.log('era:', daysToAdd,'expectedEarnings:', expected, 'actual earnings:', earnings, 'err:', err)

    expect(err).to.be.lessThanOrEqual(0.001, `Unexpected earnings over ${daysToAdd} days.`)
  }

  it("Should return token description and symbol", async function () {
    expect(await rewardsContract.name()).to.equal(
      "Davy Jone's Locker rewards token"
    );
    expect(await rewardsContract.symbol()).to.equal("DAVR");
  });

  it("Stake all", async function () {
    await rewardsContract.addController(stakingContract.address)

    type BuyerMap = {
      buyerAddress: string
      tokenId: number
    }

    this.timeout(Number.MAX_SAFE_INTEGER)

    const tokensMinted = [] as BuyerMap[]
    let totalStaked = 0;

    for (let i = 0; i < buyers.length; i += chunkSize) {

      const promises = [] as Promise<any>[]

      buyers.slice(i, i + chunkSize).forEach(buyer => {
      
        const promise = new Promise(async resolve => {

          const mint = nftContract.connect(buyer).mint({ value: PRICE }).then((mintTx: any) => {
            mintTx.wait(1).then(async (mintTxReceipt: any) => {
              const args = mintTxReceipt.events[2].args
              const tokenId = Number(args.tokenId);

              tokensMinted.push({ buyerAddress: buyer.address, tokenId })

              await stakingContract.connect(buyer).stake([tokenId])

              resolve(tokenId)
            })
          })

        })

        promises.push(promise)
      })

      totalStaked += (await Promise.all(promises)).length
    }
 
    expect(totalStaked).to.equal(buyers.length)
    expect([...new Set(tokensMinted.map(x => x.tokenId))].length).to.equal(buyers.length)

    const stakedDays = 1 * 24 * 60 * 60;

    await ethers.provider.send("evm_increaseTime", [stakedDays]);
    await ethers.provider.send("evm_mine", []);
    const buyer = buyers[0]
    const tokenId = tokensMinted.filter(x => x.buyerAddress == buyer.address)[0].tokenId

    console.log('unstaking', tokenId, 'for buyer', buyer.address)

    await stakingContract.connect(buyers[0]).unstake([tokenId])

    totalStaked = Number(await stakingContract.getTotalStaked())

    expect(totalStaked).to.equal(buyers.length - 1)
  });


  it("Stake some", async function () {

    console.time()

    await rewardsContract.addController(stakingContract.address)

    const buyerCount = 10

    const tokenIds = Array(buyerCount).fill(0)

    for (let i = 0; i < buyerCount; i++) {
      const buyer = buyers[i];
      const mintTx = await nftContract.connect(buyer).mint({ value: PRICE });
      const mintTxReceipt = await mintTx.wait(1);
      const args = mintTxReceipt.events[2].args
      const tokenId = Number(args.tokenId);
      let nftOwner = await nftContract.ownerOf(tokenId)

      expect(IDENTITIES[nftOwner]).to.equal(IDENTITIES[buyer.address])

      const stakeTx = await stakingContract.connect(buyer).stake([tokenId])

      nftOwner = Number(await nftContract.ownerOf(tokenId))

      expect(IDENTITIES[nftOwner]).to.equal(IDENTITIES[stakingContract.address])

      tokenIds[i] = tokenId
    }

    console.timeEnd()

    let totalStaked = Number(await stakingContract.getTotalStaked())

    expect(totalStaked).to.equal(buyerCount)

    const stakedDays = 1 * 24 * 60 * 60;

    await ethers.provider.send("evm_increaseTime", [stakedDays]);
    await ethers.provider.send("evm_mine", []);

    let actualPayout = 0
    let earnings = Number(await stakingContract.getEarnings())
    const setPayoutsTx = await stakingContract.setPayouts();
    const setPayoutsTxReciept = await setPayoutsTx.wait(1);

    setPayoutsTxReciept.events.forEach((event: any) => {
      actualPayout += Number(event.args.payout || 0)

      if (IDENTITIES[event.args.owner]) {
        console.log(IDENTITIES[event.args.owner], 'payout:', Number(event.args.payout || 0))
      }

    });

    console.log('earnings:', earnings, 'actual payout:', actualPayout)

    expect(earnings).to.be.greaterThanOrEqual(0)
    expect(actualPayout).to.be.greaterThanOrEqual(0)
    expect(actualPayout).to.be.lessThanOrEqual(earnings)

    for (let i = 0; i < buyerCount; i++) {
      const buyer = buyers[i];
      const payout = await stakingContract.connect(buyer).getPayout();

    }

    earnings = Number(await stakingContract.getEarnings())

    const tokenIdToUnstake = tokenIds[1];
    const owner = buyers[1];

    console.log('owner:', owner.address, 'token:', tokenIdToUnstake)



    await stakingContract.connect(owner).unstake([tokenIdToUnstake])



    totalStaked = Number(await stakingContract.getTotalStaked())

    expect(totalStaked).to.equal(buyerCount - 1)

    let buyerBalance = Number(await rewardsContract.balanceOf(owner.address))
    let owedToBuyer = Number(await stakingContract.connect(owner).getPayout())

    console.log("Buyer's balance before claim:", buyerBalance, 'Amount owed to buyer:', owedToBuyer)

    expect(Number(owedToBuyer)).to.be.greaterThan(0)
    expect(buyerBalance).to.equal(0)

    await stakingContract.connect(owner).claim()

    buyerBalance = Number(await rewardsContract.balanceOf(owner.address))
    owedToBuyer = Number(await stakingContract.connect(owner).getPayout())

    console.log("Buyer's balance after claim:", buyerBalance, 'Amount owed to buyer:', owedToBuyer)

    expect(buyerBalance).to.be.greaterThan(0)
    expect(owedToBuyer).to.equal(0)
  });
});
