/** Performs a fuzzy search over string input to find the closest matching item */
export const fuzzySearch = (input: string, toFind: string): string => {
  const windows = toWindows(input.replace(/\r?\n/g, ' '), toFind.length)

  const firstDistance = [0, jaroSimilarity(windows[0], toFind)]

  const closestIndex = windows.reduce((prev, curr, index) => {
    const distance = jaroSimilarity(curr, toFind)
    return prev[1] < distance ? [index, distance] : prev
  }, firstDistance)[0]

  return windows[closestIndex]
}

/**
 * Naive implementation to create windows over the input string
 * Returned array is of size N - S + 1 where N is the amount of characters in the string
 * and S is the required size of the window
 *
 * If the input is smaller than the requested size, an array containing
 * the input will be returned
 */

const toWindows = (input: string, size: number): string[] => {
  if (size > input.length) {
    return [input]
  }
  const result = []
  const lastWindow = input.length - size
  for (let i = 0; i <= lastWindow; i++) {
    result.push(input.slice(i, i + size))
  }

  return result
}

/**
 * Calculates the Jaro Similarity between two strings.
 * The range is from 0 to 1 where 0 means there is no similarity and 1 means they are equal.
 * Algorithm described here: https://en.wikipedia.org/wiki/Jaro%E2%80%93Winkler_distance
 */
const jaroSimilarity = (str1: string, str2: string): number => {
  if (str1 == str2) return 1.0

  const len1 = str1.length
  const len2 = str2.length

  // Max distance between characters to be considered matching
  const maxDist = Math.floor(Math.max(len1, len2) / 2) - 1

  let matches = 0
  let transpositions = 0

  const str1Matches = Array(len1).fill(false)
  const str2Matches = Array(len2).fill(false)

  // Iterate through every character of str1
  for (let i = 0; i < len1; i++) {
    // Iterate over a window of characters in str2 with a max width of maxDist * 2
    for (let j = Math.max(0, i - maxDist); j < Math.min(len2, i + maxDist + 1); j++) {
      // If the characters are equal and the second has not been matched yet, consider them a match
      if (str1.charAt(i) === str2.charAt(j) && !str2Matches[j]) {
        str1Matches[i] = true
        str2Matches[j] = true
        matches += 1

        // Found a match! Break and move to the next character
        break
      }
    }
  }

  // Return 0 if not a single match was found. Considered to have no similarity
  if (matches == 0) return 0

  let k = 0

  // Go through the matches and calculate the total transpositions
  for (let i = 0; i < len1; i++) {
    if (str1Matches[i]) {
      while (!str2Matches[k]) k++
      if (str1.charAt(i) != str2.charAt(k++)) transpositions++
    }
  }

  transpositions /= 2

  return (matches / len1 + matches / len2 + (matches - transpositions) / matches) / 3.0
}
