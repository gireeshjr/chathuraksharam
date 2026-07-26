/**
 * Return dictionary words that can land on the current reels.
 * `excludedWord` protects special pulls (the first pull excludes the answer)
 * without permanently removing that word from the puzzle's luck pool.
 *
 * @param {ReadonlyArray<ReadonlyArray<string>>} dictionary
 * @param {ReadonlySet<string>} reelLetters
 * @param {ReadonlyArray<string | null>} lockedPattern
 * @param {ReadonlySet<string>} usedWords
 * @param {string | null} excludedWord
 */
export function getEligibleSpinWords(
  dictionary,
  reelLetters,
  lockedPattern,
  usedWords,
  excludedWord,
) {
  return dictionary.filter((tiles) => {
    const word = tiles.join("");
    return (
      !usedWords.has(word) &&
      word !== excludedWord &&
      tiles.every(
        (tile, index) =>
          reelLetters.has(tile) &&
          (!lockedPattern[index] || lockedPattern[index] === tile),
      )
    );
  });
}
