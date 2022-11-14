// SPDX-License-Identifier: MIT LICENSE

pragma solidity ^0.8.4;

import "./DAVYRewards.sol";
import "./DAVYNFT.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "abdk-libraries-solidity/ABDKMath64x64.sol";
import "@quant-finance/solidity-datetime/contracts/DateTime.sol";

contract NFTStaking is Ownable, IERC721Receiver {
    int128 private _totalRewards = 500000000 ether;
    int128 private _initalRewards = 500000 ether;
    uint256 private _totalPayouts = 0;
    uint256 private _contractStart;
    uint256[] private _stakedTokens;

    // struct to store a stake's token and owner
    struct Stake {
        uint256 tokenId;
        address owner;
        uint256 rarity;
    }

    event PayeePayout(address owner, uint256 tokenId, uint256 payout);
    event TotalPayout(uint256 totalPayout, uint256 allocationForPeriod);
    event NFTStaked(address owner, uint256 tokenId, uint256 value);
    event NFTUnstaked(address owner, uint256 tokenId, uint256 value);
    event Claimed(address owner, uint256 amount);
    event EarningsForEra(
        int128 P0,
        int128 earnings,
        int128 exponent,
        int128 t,
        int128 k
    );

    // reference to the Block NFT contract
    DAVYNFT _nftContract;
    DAVYRewards _rewardsContract;

    // maps tokenId to stake
    mapping(uint256 => Stake) private _vault;

    mapping(address => uint256) private _payouts;

    constructor(DAVYNFT nftContract, DAVYRewards rewardsContract) {
        _nftContract = nftContract;
        _rewardsContract = rewardsContract;
        _contractStart = block.timestamp;
    }

    function stake(uint256[] calldata tokenIds) external {
        uint256 tokenId;
        uint256 rarity;

        for (uint256 i = 0; i < tokenIds.length; i++) {
            tokenId = tokenIds[i];
            require(
                _nftContract.ownerOf(tokenId) == msg.sender,
                "not your token"
            );
            require(_vault[tokenId].tokenId != tokenId, "already staked");

            rarity = _nftContract.getRarity(tokenId);

            _nftContract.transferFrom(msg.sender, address(this), tokenId);

            emit NFTStaked(msg.sender, tokenId, block.timestamp);

            _stakedTokens.push(tokenId);

            _vault[tokenId] = Stake({
                owner: msg.sender,
                tokenId: tokenId,
                rarity: rarity
            });
        }
    }

    function unstake(uint256[] calldata tokenIds) external {
        uint256 tokenId;

        _setPayouts();

        for (uint256 i = 0; i < tokenIds.length; i++) {
            tokenId = tokenIds[i];
            Stake memory staked = _vault[tokenId];
            require(staked.owner == msg.sender, "not your token");

            _removeToken(tokenId);
            _nftContract.transferFrom(address(this), msg.sender, tokenId);

            delete _vault[tokenId];
        }
    }

    function _removeToken(uint256 tokenId) private {
        for (uint256 i; i < _stakedTokens.length; i++) {
            if (_stakedTokens[i] == tokenId) {
                _stakedTokens[i] = _stakedTokens[_stakedTokens.length - 1];
                _stakedTokens.pop();
                break;
            }
        }
    }

    function getContractStart() public view returns (uint256) {
        return _contractStart;
    }

    // rewards = P0  + P0 * k - P0 * k * exp(-t/k)
    //
    //  term1 = P0
    //  term2 = k * P0
    //  term3 = k * P0 * exp(-t/k)
    function getEarningsForEra() public view returns (uint256) {
        uint256 daysInEra = DateTime.diffDays(
            _contractStart,
            block.timestamp
        );
        int128 t = ABDKMath64x64.fromUInt(daysInEra);
        int128 PT = _totalRewards;
        int128 P0 = _initalRewards;
        int128 R = ABDKMath64x64.div(PT, P0);
        int128 k = ABDKMath64x64.sub(R, 1);
        int128 exp = ABDKMath64x64.divi(t, k);
        int128 exponent = ABDKMath64x64.exp(
            ABDKMath64x64.mul(ABDKMath64x64.fromInt(-1), exp)
        );
        int128 term1 = P0;
        int128 term2 = P0 * (k / 2**64);
        int128 term3 = ABDKMath64x64.mul(term2, exponent);
        int128 earnings = ABDKMath64x64.add(
            term1,
            ABDKMath64x64.sub(term2, term3)
        );

        return
            uint256(ABDKMath64x64.to128x128(earnings)) / 2**64 - _totalPayouts;
    }

    function _setPayouts() private {
        uint256[] memory tokenIds = _stakedTokens;
        uint256 tokenId;
        uint256 amount;
        uint256 payout;
        Stake memory staked;
        uint256 T = getEarningsForEra();
        uint256 N = tokenIds.length;

        for (uint256 i = 0; i < tokenIds.length; i++) {
            tokenId = tokenIds[uint256(i)];
            staked = _vault[tokenId];
            amount = (staked.rarity * ((2 * T - (2 * T * i) / N) / N)) / 10;
            _payouts[staked.owner] += uint256(amount);
            payout += amount;

            emit PayeePayout(staked.owner, tokenId, _payouts[staked.owner]);
        }

        _totalPayouts = payout;

        emit TotalPayout(payout, T);
    }

    function setPayouts() public onlyOwner {
        _setPayouts();
    }

    function getPayout() external view returns (uint256) {
        return _payouts[msg.sender];
    }

    function claim() public {
        uint256 amount = _payouts[msg.sender];

        if (amount > 0) {
            _rewardsContract.mint(msg.sender, amount);
        }

        delete _payouts[msg.sender];

        emit Claimed(msg.sender, amount);
    }

    function onERC721Received(
        address,
        address from,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        require(from == address(0x0), "Cannot send nfts to Vault directly");
        return IERC721Receiver.onERC721Received.selector;
    }

    function getTotalStaked() external view returns (uint256) {
        return _stakedTokens.length;
    }
}
