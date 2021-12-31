const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')
const puppeteer = require('puppeteer')
const { InfluxDB, Point } = require('@influxdata/influxdb-client')

const { headless, test } = yargs(hideBin(process.argv))
  .option('headless', {
    type: 'boolean',
    default: true
  })
  .option('test', {
    type: 'boolean',
    default: false
  }).argv

let writeApi = null
if (!test) {
  const INFLUXDB_URL = process.env.INFLUXDB_URL
  const INFLUXDB_TOKEN = process.env.INFLUXDB_TOKEN
  const INFLUXDB_ORG = process.env.INFLUXDB_ORG
  const INFLUXDB_BUCKET = process.env.INFLUXDB_BUCKET

  const influxDB = new InfluxDB({ url: INFLUXDB_URL, token: INFLUXDB_TOKEN })
  writeApi = influxDB.getWriteApi(INFLUXDB_ORG, INFLUXDB_BUCKET)
}

const getValues = async (page) => {
  const result = await page.evaluate(() => {
    return {
      download: document.querySelector('#speed-value').textContent,
      downloadUnit: document.querySelector('#speed-units').textContent.trim(),
      latency: document.querySelector('#latency-value').textContent,
      latencyUnit: document.querySelector('#latency-units').textContent,
      upload: document.querySelector('#upload-value').textContent,
      uploadUnit: document.querySelector('#upload-units').textContent.trim()
    }
  })

  return result
}

const main = async () => {
  console.time('speedtest')

  const browser = await puppeteer.launch({
    headless: headless,
    args: ['--no-sandbox']
  })

  try {
    const page = await browser.newPage()
    await page.goto('https://fast.com/ja/', { waitUntil: 'domcontentloaded', timeout: 0 })

    await page.waitForSelector('#speed-progress-indicator.succeeded')

    await page.click('#show-more-details-link')
    await page.waitForSelector('#speed-progress-indicator.succeeded', { timeout: 60000 })

    const result = await getValues(page)
    console.log('speedtest:', result)

    const point = new Point('speedtest')
      .floatField('download', result.download)
      .floatField('latency', result.latency)
      .floatField('upload', result.upload)

    if (!test) {
      writeApi.writePoint(point)
      await writeApi.close()
      console.log('write data!')
    }
  } catch (e) {
    console.log('error:', e)
  } finally {
    browser.close()
  }

  console.timeEnd('speedtest')
  console.log('done:', new Date())
}

main().catch(console.error)
