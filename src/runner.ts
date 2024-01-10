import {spawn, ChildProcess} from 'child_process'
import kill from 'tree-kill'
import {v4 as uuidv4} from 'uuid'
import * as core from '@actions/core'
import {setCheckRunOutput} from './output'
import * as os from 'os'
import chalk from 'chalk'

const color = new chalk.Instance({level: 1})

export type TestComparison = 'exact' | 'included' | 'regex'

export interface Test {
  readonly name: string
  readonly setup: string
  readonly run: string
  readonly input?: string
  readonly output?: string
  readonly timeout: number
  readonly points?: number
  readonly extra?: boolean
  readonly comparison: TestComparison
}

export class TestError extends Error {
  constructor(message: string) {
    super(message)
    Error.captureStackTrace(this, TestError)
  }
}

export class TestTimeoutError extends TestError {
  constructor(message: string) {
    super(message)
    Error.captureStackTrace(this, TestTimeoutError)
  }
}

export class TestOutputError extends TestError {
  expected: string
  actual: string

  constructor(message: string, expected: string, actual: string) {
    super(`${message}
    Expected Regular Expression (regex) Match:
${expected}
    Actual:
${actual}`)

    this.expected = expected
    this.actual = actual

    Error.captureStackTrace(this, TestOutputError)
  }
}

const log = (text: string): void => {
  process.stdout.write(text + os.EOL)
}

const normalizeLineEndings = (text: string): string => {
  return text.replace(/\r\n/gi, '\n').trim()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const indent = (text: any): string => {
  let str = '' + new String(text)
  str = str.replace(/\r\n/gim, '\n').replace(/\n/gim, '\n  ')
  return str
}

const waitForExit = async (child: ChildProcess, timeout: number): Promise<void> => {
  // eslint-disable-next-line no-undef
  return new Promise((resolve, reject) => {
    let timedOut = false

    const exitTimeout = setTimeout(() => {
      timedOut = true
      reject(new TestTimeoutError(`Setup timed out in ${timeout} milliseconds`))
      kill(child.pid)
    }, timeout)

    child.once('exit', (code: number, signal: string) => {
      if (timedOut) return
      clearTimeout(exitTimeout)

      if (code === 0) {
        resolve(undefined)
      } else {
        reject(new TestError(`Error: Exit with code: ${code} and signal: ${signal}`))
      }
    })

    child.once('error', (error: Error) => {
      if (timedOut) return
      clearTimeout(exitTimeout)

      reject(error)
    })
  })
}

const runSetup = async (test: Test, cwd: string, timeout: number): Promise<void> => {
  if (!test.setup || test.setup === '') {
    return
  }

  const setup = spawn(test.setup, {
    cwd,
    shell: true,
    env: {
      PATH: process.env['PATH'],
      FORCE_COLOR: 'true',
    },
  })

  // Start with a single new line
  process.stdout.write(indent('\n'))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setup.stdout.on('data', chunk => {
    process.stdout.write(indent(chunk))
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setup.stderr.on('data', chunk => {
    process.stderr.write(indent(chunk))
  })

  await waitForExit(setup, timeout)
}

// function throwError(header:string,exp:string,act:string) {
//   return new Promise((resolve) => {
//       core.error(`${header}\nExpected:\n${exp}\nActual:\n${act}`)
//       resolve("test")
//   });

// }

const runCommand = async (test: Test, cwd: string, timeout: number) => {
  const child = spawn(test.run, {
    cwd,
    shell: true,
    env: {
      PATH: process.env['PATH'],
      FORCE_COLOR: 'true',
    },
  })

  let output = ''

  // Start with a single new line
  process.stdout.write(indent('\n'))

  child.stdout.on('data', chunk => {
    process.stdout.write(indent(chunk))
    output += chunk
  })

  child.stderr.on('data', chunk => {
    process.stderr.write(indent(chunk))
  })

  // Preload the inputs
  if (test.input && test.input !== '') {
    child.stdin.write(test.input)
    child.stdin.end()
  }

  await waitForExit(child, timeout)

  // Eventually work off the the test type
  if ((!test.output || test.output == '') && (!test.input || test.input == '')) {
    return
  }

  const expected = normalizeLineEndings(test.output || '')
  const actual = normalizeLineEndings(output)

  const diffMessage = (actual: string, expected: string): string => {
    const linesActual = actual.split(/\r?\n/)
    const linesExpected = expected.split(/\r?\n/)
    const minLines = Math.min(linesActual.length, linesExpected.length)
    const result = []
    result.push('')
    result.push('Full program output:')
    result.push(actual)
    result.push('')
    result.push(``)
    result.push(`Num lines expected ` + linesExpected.length)
    result.push(`  Num lines actual ` + linesActual.length)

    let cActual = ``
    let cExpected = ``
    let expectedLine = ``
    let actualLine = ``

    result.push(``)
    // Look at each line
    let i
    for (i = 0; i < minLines; i++) {
      expectedLine = linesExpected[i]
      actualLine = linesActual[i]

      if (actualLine == expectedLine) {
        result.push(`🟩Line ` + i + `\tExpected: "` + expectedLine + `"`)
        result.push(`🟩Line ` + i + `\t  Actual: "` + actualLine + `"`)
      } else {
        result.push(`🟥------- Mismatch on line ` + i)
        const diff = [...expectedLine]
        for (let j = 0; j < expectedLine.length; j++) {
          if (actualLine[j] != expectedLine[j]) {
            cActual = actualLine[j]
            cExpected = expectedLine[j]
            diff[j] = `^`
          } else {
            diff[j] = `_`
          }
        }

        const diffLine = diff.join('')
        result.push(``)
        result.push(`🟥EXPECTED: "` + expectedLine + `"`)
        result.push(`🟥  ACTUAL: "` + actualLine + `"`)
        result.push(`🟥           ` + diffLine)
        result.push(``)
        if (expectedLine.length >= actualLine.length) {
          result.push(`🟥Character '` + cActual + `' does not match expected character '` + cExpected + `'`)
          result.push(``)
        }
        result.push(`🟥Note: If both lines look the same, then it could be the an`)
        result.push(`🟥invisible whitespace such as a tab or newline. Highlighting`)
        result.push(`🟥and/or copying each line could help you figure out if there`)
        result.push(`🟥are hidden whitespace characters.`)
        return result.join(os.EOL)
      }
    }

    if (linesActual.length < linesExpected.length) {
      result.push(``)
      result.push(`🟥Your program is missing output.`)
      result.push(``)
      result.push(`🟥Missing output: "` + linesExpected[i] + `"`)
    } else if (linesActual.length > linesExpected.length) {
      result.push(``)
      result.push(`🟥Extra output found in your program output.`)
      result.push(``)
      result.push(`🟥Extra output: "` + linesActual[i] + `"`)
    }
    return result.join(os.EOL)
  }

  switch (test.comparison) {
    case 'exact':
      if (actual != expected) {
        //core.group(`Error: ${test.name}`, async() => {
        const result = diffMessage(actual, expected)
        throw new TestError(`The output for test ${test.name} does not match:
${result}`)
        //throw new TestOutputError(`The output for test ${test.name} did not match`, expected, actual)
        //core.endGroup()
      }
      break
    case 'regex':
      // Note: do not use expected here
      if (!actual.match(new RegExp(test.output || ''))) {
        //core.startGroup(`Error: ${test.name}`)
        throw new TestOutputError(`The output for test ${test.name} did not match`, test.output || '', actual)
        //core.endGroup()
      }
      break
    default:
      // The default comparison mode is 'included'
      if (!actual.includes(expected)) {
        //core.group(`Error: ${test.name}`, async() => {
        const result = diffMessage(actual, expected)
        throw new TestError(`The output for test ${test.name} did not match:
${result}`)
        //throw new TestOutputError(`The output for test ${test.name} did not match`, expected, actual)
        //core.endGroup()
      }
      break
  }
  return output
}

export const run = async (test: Test, cwd: string) => {
  // Timeouts are in minutes, but need to be in ms
  let timeout = (test.timeout || 1) * 60 * 1000 || 30000
  const start = process.hrtime()
  await runSetup(test, cwd, timeout)
  const elapsed = process.hrtime(start)
  // Subtract the elapsed seconds (0) and nanoseconds (1) to find the remaining timeout
  timeout -= Math.floor(elapsed[0] * 1000 + elapsed[1] / 1000000)
  const result = await runCommand(test, cwd, timeout)
  return result
}

export const runAll = async (tests: Array<Test>, cwd: string): Promise<void> => {
  let points = 0
  let availablePoints = 0
  let passed = 0
  let numtests = 0
  let hasPoints = false

  let failed = false
  const passing = []
  const failing = []

  for (const test of tests) {
    numtests += 1
    log('')
    // https://help.github.com/en/actions/reference/development-tools-for-github-actions#stop-and-start-log-commands-stop-commands
    const token = uuidv4()
    log('')
    log(`::stop-commands::${token}`)
    log('')

    try {
      if (test.points) {
        hasPoints = true
        if (!test.extra) {
          availablePoints += test.points
        }
      }
      log(color.cyan(`📝 ${test.name}`))

      const result = await run(test, cwd)
      // Restart command processing
      log('')
      log(`::${token}::`)

      log('')
      log(color.green(`✅ completed - ${test.name}`))
      log(``)
      core.summary.addRaw(`#### Passed ${test.name}`, true)
      core.summary.addCodeBlock(result || 'no output')

      if (test.points) {
        points += test.points
      }
      passing.push(test.name)
      passed += 1
    } catch (error) {
      log('')
      // Restart command processing
      log('')
      log(`::${token}::`)

      failing.push(test.name)
      log(color.yellow(`🚧 needs repair - ${test.name}`))
      if (!test.extra) {
        failed = true
        if (error instanceof Error) {
          core.summary.addRaw(`#### Needs Repair - ${test.name}`, true)
          core.summary.addCodeBlock(error.message)
          const errors = []
          errors.push(error.message)
          if (error.message.indexOf('regex') != -1) {
            core.summary.addRaw('', true)
            const sText =
              '**Note:** [debuggex](https://www.debuggex.com) will take the *expected* text in the first box and the *actual* text in the second box and show you a *red line* for where the test fails.'
            core.summary.addRaw(sText, true)
            core.summary.addRaw('', true)
            const eText = `Note: https://www.debuggex.com will take the Expected text in the first box and the Actual text in the second box and show you a red line for where the test fails.`
            errors.push(eText)
          }
          //core.summary.write()
          log(errors.join(os.EOL))
        } else {
          log('Unknown exception')
        }
      }
    }
  }

  if (failed) {
    // We need a good failure experience
    log('')
    log(color.red('At least one test failed'))
    log('')
    log('Please, look at the output and make sure it makes sense to you.')
    log(' If it does, then check the requirements to see what formatting may need to change.')
    log('')
  } else {
    log('')
    log(color.green('All tests passed'))
    log('')
    log('Please, still look at the output and make sure it looks right to you.')
    log('')
    log('✨🌟💖💎🦄💎💖🌟✨🌟💖💎🦄💎💖🌟✨')
    log('')
  }

  if (points > availablePoints) {
    const extraCreditPoints = 1 * (points - availablePoints)
    log(`💪💪💪 You earned ${extraCreditPoints} extra credit points`)
    log('')
  }

  const text = `Tests Passed: ${passed}/${numtests}  
  Passing tests: ${passing}  
  Failing tests: ${failing}  `
  core.summary.addRaw('## Test Summary', true)
  core.summary.addRaw(text, true)
  core.summary.write()
  //log(color.bold.bgCyan.black(text))
  log(color.bold.bgCyan.black(text))
  log('')
  log('')

  await setCheckRunOutput(text, 'Summary')

  // Set the number of points
  if (hasPoints) {
    const text = `Points ${points}/${availablePoints}`
    log(color.bold.bgCyan.black(text))
    core.setOutput('Points', `${points}/${availablePoints}`)
    await setCheckRunOutput(text, 'complete')
  } else {
    // set the number of tests that passed
    const text = `Points ${passed}/${numtests}`
    //Passing tests: ${passing}
    //Failing tests: ${failing}`
    //log(color.bold.bgCyan.black(text))
    //log(color.bold.bgCyan.black(text))
    core.setOutput('Points', `${passed}/${numtests}`)
    await setCheckRunOutput(text, 'complete')
  }
}
