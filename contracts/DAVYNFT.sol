// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "hardhat/console.sol";

error PriceNotMet(address nftAddress, uint256 price);

contract DAVYNFT is ERC721, Ownable {
    string private _tokenString = "";
    string private _rarityString = "";
    bytes32 private _rollingTokenHash = bytes32(0);
    bytes32 private _rollingHash;
    uint256 private _PRICE = (2 ether) / 1e6;
    string private baseURI_ = "http://defaultBaseUri.com/";
    address private _stakingContractAddress;
    uint256 private NFT_SUPPLY = 0;
    uint256 private _lastMintedTokenId;

    event DavyMinted(
        address indexed nftAddress,
        address indexed buyer,
        uint256 indexed tokenId,
        uint256 rarity
    );

    struct MetaData {
        uint24 rarity;
    }

    mapping(uint256 => uint256) private _rarities;

    constructor() payable ERC721("Davy Jone's Locker NFT", "DAVY") {}

    function _baseURI() internal view virtual override returns (string memory) {
        return baseURI_;
    }

    // Sets the initial rolling hash value to be used to confirm the provenance hash.
    function initializeRollingTokenHash(bytes32 seed) public onlyOwner {
        require(
            _rollingTokenHash == bytes32(0),
            "The rolling token seed has already been set"
        );

        _rollingTokenHash = seed;
    }

    function getPrice() public view returns (uint256) {
        return _PRICE;
    }

    function getLastMintedToken() public view returns (uint256) {
        return _lastMintedTokenId;
    }

    function setStakingContract(address stakingContract) public onlyOwner {
        _stakingContractAddress = stakingContract;
    }

    function _append(string memory a, string memory b)
        internal
        pure
        returns (string memory)
    {
        return string(abi.encodePacked(a, b));
    }

    function _calculateHash(bytes memory value) private pure returns (bytes32) {
        return keccak256(value);
    }

    function _bytes32ToHex(bytes32 data) private pure returns (string memory) {
        return Strings.toHexString(uint256(data), 32);
    }

    // Make 'onlyOwner' after testing is complete.
    function calculateHash(bytes memory value)
        public
        pure
        returns (string memory)
    {
        bytes32 data = _calculateHash(value);

        return _bytes32ToHex(data);
    }

    // Make 'onlyOwner' after testing is complete.
    function concatenateHash(bytes32 value1, bytes32 value2)
        public
        pure
        returns (bytes32)
    {
        return _concatenateHash(value1, value2);
    }

    function _concatenateHash(bytes32 value1, bytes32 value2)
        private
        pure
        returns (bytes32)
    {
        if (value1 == 0) {
            return keccak256(bytes.concat(value2));
        } else {
            return keccak256(bytes.concat(value1, value2));
        }
    }

    function mint(
        uint256 tokenId,
        uint256 rarity,
        bytes32 tokenHash,
        bytes32 rollingTokenHash
    ) external payable {
        // console.log("tokenId:                 ", tokenId);
        // console.log("_rollingTokenHash:       ", _bytes32ToHex(_rollingTokenHash));
        // console.log("tokenHash:               ", _bytes32ToHex(tokenHash));
        // console.log("rollingTokenHash:        ", _bytes32ToHex(rollingTokenHash));
        // console.log("expectedRollingTokenHash:", _bytes32ToHex(_concatenateHash(_rollingTokenHash, tokenHash)));

        require(
            keccak256(
                abi.encodePacked(_concatenateHash(_rollingTokenHash, tokenHash))
            ) == keccak256(abi.encodePacked(rollingTokenHash)),
            "Rolling token does not match."
        );

        require(msg.value >= _PRICE, "Insufficient payment");

        (bool success, ) = payable(owner()).call{value: msg.value}("");

        require(success, "Transfer failed");

        _safeMint(msg.sender, tokenId);
        _approve(_stakingContractAddress, tokenId);

        _tokenString = _append(_tokenString, Strings.toString(tokenId));
        _rarityString = _append(_rarityString, Strings.toString(tokenId));
        _rarities[tokenId] = rarity;
        _rollingTokenHash = _concatenateHash(_rollingTokenHash, tokenHash);
        _lastMintedTokenId = tokenId;

        emit DavyMinted(owner(), msg.sender, tokenId, rarity);
    }

    function getRarity(uint256 tokenId) public view returns (uint256) {
        return _rarities[tokenId];
    }

    function setBaseURI(string memory _newBaseURI) public onlyOwner {
        baseURI_ = _newBaseURI;
    }
}
