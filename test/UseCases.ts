import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Contract, BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const PRICE = ethers.utils.parseEther("2");

describe("Mint and list NFT", function () {
  let marketPlaceContractOwner: SignerWithAddress;
  let marketplaceContract: Contract;
  let buyer1: SignerWithAddress;
  let nftContractOwner: SignerWithAddress;
  let nftContract: Contract;
  let rewardsContractOwner: SignerWithAddress;
  let rewardsContract: Contract;
  let stakingContractOwner: SignerWithAddress;
  let stakingContract: Contract;
  let IDENTITIES: {
    [x: string]: string;
  };

  beforeEach(async () => {
    [
      buyer1,
      nftContractOwner,
      marketPlaceContractOwner,
      stakingContractOwner,
      rewardsContractOwner,
    ] = await ethers.getSigners();

    const NftMarketplace = await ethers.getContractFactory(
      "NftMarketplace",
      marketPlaceContractOwner
    );
    const NFTContract = await ethers.getContractFactory(
      "DAVYNFT",
      nftContractOwner
    );
    const RewardsContract = await ethers.getContractFactory(
      "DAVYRewards",
      rewardsContractOwner
    );
    const StakingContract = await ethers.getContractFactory(
      "NFTStaking",
      stakingContractOwner
    );

    marketplaceContract = await NftMarketplace.deploy();
    nftContract = await NFTContract.deploy();
    rewardsContract = await RewardsContract.deploy();
    stakingContract = await StakingContract.deploy(
      nftContract.address,
      rewardsContract.address
    );

    IDENTITIES = {
      [buyer1.address]: "BUYER_1",
      [nftContractOwner.address]: "NFT_CONTRACT_OWNER",
      [nftContract.address]: "NFT_CONTRACT",
      [marketPlaceContractOwner.address]: "MARTKETPLACE_CONTRACT_OWNER",
      [marketplaceContract.address]: "MARKETPLACE_CONTRACT",
      [rewardsContractOwner.address]: "REWARDS_CONTRACT_OWNER",
      [rewardsContract.address]: "REWARDS_CONTRACT",
      [stakingContractOwner.address]: "STAKING_CONTRACT_OWNER",
      [stakingContract.address]: "STAKING_CONTRACT",
    };

    await marketplaceContract.deployed();
    await nftContract.deployed();
  });

  it("Mint and list", async function name() {
    //* MInt NFT
    const mintTx = await nftContract.connect(nftContractOwner).mintNft();
    const mintTxReceipt = await mintTx.wait(1);
    const tokenId = Number(mintTxReceipt.events[0].args.tokenId);
    const mintOwner = mintTxReceipt.events[0].args.to;

    expect(IDENTITIES[mintOwner]).to.equal("NFT_CONTRACT_OWNER");
    expect(tokenId).to.equal(0);

    const setApprovalTx = await nftContract
      .connect(nftContractOwner)
      .approve(marketplaceContract.address, tokenId);
    const setApprovalReceipt = await setApprovalTx.wait(1);
    const ownerAddress = setApprovalReceipt.events[0].args.owner; // const operatorAddress = setApprovalReceipt.events[0].args.operator;
    const approvedAddress = setApprovalReceipt.events[0].args.approved;
    const approvedTokenId = Number(setApprovalReceipt.events[0].args.tokenId);

    expect(IDENTITIES[ownerAddress]).to.equal("NFT_CONTRACT_OWNER");
    expect(IDENTITIES[approvedAddress]).to.equal("MARKETPLACE_CONTRACT");
    expect(approvedTokenId).to.equal(tokenId);

    //* List NFT in marketplace
    const listTx = await marketplaceContract
      .connect(nftContractOwner)
      .listItem(nftContract.address, tokenId, PRICE);
    const listTxReceipt = await listTx.wait(1);
    const sellerAddress = listTxReceipt.events[0].args.seller;
    const listedNftAddress = listTxReceipt.events[0].args.nftAddress;
    const listedTokenId = Number(listTxReceipt.events[0].args.tokenId);
    const listedPrice = listTxReceipt.events[0].args.price;

    expect(IDENTITIES[sellerAddress]).to.equal("NFT_CONTRACT_OWNER");
    expect(IDENTITIES[listedNftAddress]).to.equal("NFT_CONTRACT");
    expect(listedTokenId).to.equal(tokenId);
    expect(listedPrice).to.equal(PRICE);

    const provider = ethers.provider;
    const balance0ETHBefore = await provider.getBalance(
      nftContractOwner.address
    );

    // console.log("balance0ETHBefore", balance0ETHBefore);

    const buyNftTx = await marketplaceContract
      .connect(buyer1)
      .buyItem(nftContract.address, tokenId, {
        value: PRICE,
      });
    const buyNftTxReceipt = await buyNftTx.wait(1);
    const buyer = buyNftTxReceipt.events[2].args.buyer;
    const bougthNftAddress = buyNftTxReceipt.events[2].args.nftAddress;
    const boughtTokenId = buyNftTxReceipt.events[2].args.tokenId;
    const boughtPrice = buyNftTxReceipt.events[2].args.price;

    expect(IDENTITIES[buyer]).to.equal("BUYER_1");
    expect(IDENTITIES[bougthNftAddress]).to.equal("NFT_CONTRACT");
    expect(boughtTokenId).to.equal(tokenId);
    expect(boughtPrice).to.equal(PRICE);

    const withdrawProceedsTx = await marketplaceContract
      .connect(nftContractOwner)
      .withdrawProceeds();
    const withdrawProceedsTxRecipt = await withdrawProceedsTx.wait(1);

    const balance0ETHAfter = await provider.getBalance(
      nftContractOwner.address
    );

    expect(Number(balance0ETHAfter)).to.be.greaterThan(
      Number(balance0ETHBefore)
    );

    const addControllerTx = await rewardsContract
      .connect(rewardsContractOwner)
      .addController(stakingContract.address);
    const addControllerTxReceipt = await addControllerTx.wait(1);
    const controllerAddress = addControllerTxReceipt.events[0].args.controller;

    expect(IDENTITIES[controllerAddress]).to.equal("STAKING_CONTRACT");

    const approvalStakingContractTx = await nftContract
      .connect(buyer1)
      .approve(stakingContract.address, tokenId);
    const approvalStakingContractTxReceipt =
      await approvalStakingContractTx.wait(1);
    const approvedStakedOwnerAddress =
      approvalStakingContractTxReceipt.events[0].args.owner;
    const approvedStakedContractAddress =
      approvalStakingContractTxReceipt.events[0].args.approved;
    const approvedStakedTokenId = Number(
      approvalStakingContractTxReceipt.events[0].args.tokenId
    );

    expect(IDENTITIES[approvedStakedOwnerAddress]).to.equal("BUYER_1");
    expect(IDENTITIES[approvedStakedContractAddress]).to.equal(
      "STAKING_CONTRACT"
    );
    expect(approvedStakedTokenId).to.equal(tokenId);

    const stakeTx = await stakingContract.connect(buyer1).stake([tokenId]);
    const stakeTxReceipt = await stakeTx.wait(1);
    const sevenDays = 7 * 24 * 60 * 60;

    await ethers.provider.send("evm_increaseTime", [sevenDays]);
    await ethers.provider.send("evm_mine", []);

    const earnings = await stakingContract.earningInfo(buyer1.address, [
      tokenId,
    ]);

    // console.log("earnings", earnings);

    expect(Number(earnings)).to.be.greaterThan(0);

    const balanceBefore = await rewardsContract
      .connect(buyer1)
      .balanceOf(buyer1.address);

    const claimTx = await stakingContract.connect(buyer1).claim([tokenId]);
    const claimTxReceipt = await claimTx.wait(1);

    // console.log("claimTxReceipt", claimTxReceipt.events[0]);

    const balanceAfter = await rewardsContract
      .connect(buyer1)
      .balanceOf(buyer1.address);

    // console.log(
    //   "balanceBefore:",
    //   Number(balanceBefore),
    //   "balanceAfter:",
    //   Number(balanceAfter)
    // );

    expect(Number(balanceAfter)).to.be.greaterThan(0);
    expect(Number(balanceAfter)).to.be.greaterThan(Number(balanceBefore));

    // console.log("balance0ETHAfter", balance0ETHAfter);
    // console.log("tokenId", tokenId);
  });
});
