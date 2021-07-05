const puppeteer = require("puppeteer")
const parser = require("node-html-parser")
const fs = require("fs")

const MEDICAL_EQUIPMENT_URL =
  "https://www.rceth.by/Refbank/reestr_medicinskoy_tehniki/results"
const MEDICATIONS_URL =
  "https://www.rceth.by/Refbank/reestr_lekarstvennih_sredstv/"

const medEquipPageSelectors = {
  submitFormButton: "input[type='submit']",
  registrationDateField: "#FProps_5__CritElemsD_Val1",
  regSortType: "#FProps_5__CritElemsD_Crit",
  tableRow: ".results table tbody tr",
  choosePageSelect: "select#FOpt_PageN",
}

const medicinesPageSelectors = {
  submitFormButton: "input[type='submit']",
  registrationDateField: "input#FProps_7__CritElemsD_Val1",
  regSortType: "select#FProps_7__CritElemsD_Crit",
  tableRow: ".results table tbody tr",
  choosePageSelect: "select#FOpt_PageN",
}

async function parsePage(
  selectors,
  pageUrl,
  mapArrayToObject,
  progressLogger,
  uniqueItemIndex
) {
  let resultObject = {}
  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()
  await page.setDefaultTimeout(10000000)
  await page.goto(pageUrl)
  await page.type(selectors.registrationDateField, "01.01.1999")
  await page.select(selectors.regSortType, "Great")
  await Promise.all([
    page.click(selectors.submitFormButton),
    page.waitForNavigation(),
  ])
  const choosePageSelect = await page.$(selectors.choosePageSelect)
  const choosePageSelectOptions = await page.evaluate(
    (select) =>
      [...select.options]
        .map((option) => option.value)
        .filter((value) => +value),
    choosePageSelect
  )
  for (let currentPage of choosePageSelectOptions) {
    await Promise.all([
      page.select(selectors.choosePageSelect, currentPage),
      page.waitForNavigation(),
    ])
    resultObject = await parseTable(
      resultObject,
      page,
      selectors.tableRow,
      mapArrayToObject,
      uniqueItemIndex
    )
    progressLogger(currentPage, choosePageSelectOptions.length)
  }
  await browser.close()
  return resultObject
}

function medEquipDataArrayToObject(dataArray) {
  const resultObject = {
    name: dataArray[1],
    manufacturer: dataArray[2],
    declarant: dataArray[3],
    idNumber: dataArray[4],
    registerNumber: dataArray[5],
    registrationDate: dataArray[6],
    validity: dataArray[7],
    type: dataArray[8],
  }
  return resultObject
}

function medicineArrayToObject(dataArray) {
  const resultObject = {
    tradingName: dataArray[1],
    internationalName: dataArray[2],
    manufacturer: dataArray[3],
    declarant: dataArray[4],
    idNumber: dataArray[5],
    registrationDate: dataArray[6],
    validity: dataArray[7],
    original: dataArray[8],
  }
  return resultObject
}

function progressLogger(current, max) {
  console.log(`Parsed ${current} of ${max}`)
}

async function parseTable(
  storeObject,
  page,
  dataRowElementSelector,
  mapArrayToObjectFn,
  uniqueItemIndex
) {
  const rows = await page.$$(dataRowElementSelector)
  await rows.forEach(async (row) => {
    const data = await page.evaluate((row) => row.innerHTML, row)
    const root = parser.parse(data)
    const tdsTexts = root.querySelectorAll("td").map((td) => {
      const elementText = [...td.childNodes]
        .map((childNode) => {
          return childNode.textContent.trim()
        })
        .join("")
      return elementText
    })
    if (!storeObject[tdsTexts[uniqueItemIndex]]) {
      storeObject[tdsTexts[uniqueItemIndex]] = mapArrayToObjectFn(tdsTexts)
    }
  })
  return storeObject
}

async function parseData() {
  console.log("Starting parsing medical equipment")
  const medEquipObject = await parsePage(
    medEquipPageSelectors,
    MEDICAL_EQUIPMENT_URL,
    medEquipDataArrayToObject,
    progressLogger,
    5
  )
  console.log("Starting parsing medicines")
  const medications = await parsePage(
    medicinesPageSelectors,
    MEDICATIONS_URL,
    medicineArrayToObject,
    progressLogger,
    1
  )
  return {
    medicalEquipment: medEquipObject,
    medications: medications,
  }
}

parseData().then((result) => {
  fs.writeFileSync("result.json", JSON.stringify(result))
})

setInterval(() => {
  parseData().then((result) => {
    fs.writeFileSync("result.json", JSON.stringify(result))
  })
}, 1000 * 60 * 20) //каждые 20 минут
