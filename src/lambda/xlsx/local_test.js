const XLSX = require("xlsx-js-style")
const path = require("node:path")

const { readFile, utils } = XLSX

// Read the file function
// Example script
// node resources/container-tasks/xlsx-handlers/src/organization-monthly-usage/local_test.js --organization ACS --tabs 'IP to MAID Activity, Web Pixel Activity' --inputFilePath './MonthlyUsageReport_April-2024.xlsx' --outputPath outputpath
const parseInputFile = () => {
  const { organization, tabs, inputFilePath = './MonthlyUsageReport_April-2024.xlsx', outputPath } = parseArguments()
  const filtering = {
    organization: organization || "ACS",
    tabs: tabs || "Summary, Audiences Created, Audiences Published, Audience Downloads, Geoframes Created, Geoframe Orders, Attribution Usage, Web Pixel Activity, IP to MAID Activity",
    outputPath: outputPath || "./output/",
  }

  const isS3Path = isS3(inputFilePath)

  // Read the file
  const took_sheets = readInputFile(inputFilePath, filtering)

  // Write the output file
  const output = path.join(__dirname, filtering.outputPath)
  const fileName = `MonthlyUsageReport_April-2024-${
    filtering.organization
  }-${new Date().getTime()}.xlsx`
  const outputFilePath = path.join(output, fileName)

  const dataForSheet = []

  took_sheets.forEach((section, sectionIndex) => {
    const sectionName = section.sectionName
    let sectionData = section.sectionData
    if (!sectionData.length) sectionData = [{"# No data": null}]
    // Section name
    dataForSheet.push([{ v: sectionName, s: { font: { bold: true } } }])
    dataForSheet.push([])
    // Get section columns
    const columnNames = Object.keys(sectionData[0])
    dataForSheet.push(
      columnNames.map((colName) => ({
        v: colName,
        s: { font: { bold: true } },
      })),
    )
    // Add section data
    section.sectionData.forEach((row) => {
      const rowData = []
      columnNames.forEach((col) => {
        let data = row[col]

        // Format number data x,xxx,xxx
        if (!isNaN(Number(data))) {
          data = Number(data).toLocaleString()
        }

        rowData.push(data)
      })
      dataForSheet.push(rowData)
    })

    // Add an empty row between sections
    dataForSheet.push([])
  })

  const ws = XLSX.utils.aoa_to_sheet(dataForSheet)

  // TO-DO: Set column width
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1")
  XLSX.writeFile(wb, outputFilePath)

  return { took_sheets }
}

// --- COMMON FUNCTIONS --->

function readInputFile(fileName, { tabs, organization }) {
  const inputFile = path.join(__dirname, fileName)
  const workbook = readFile(inputFile)
  const sheet_name_list = workbook.SheetNames
  const took_sheet_names = sheet_name_list.filter((sheet) =>
    tabs.includes(sheet),
  )

  return took_sheet_names.map((sheet) => ({
    sectionName: sheet,
    sectionData: utils
      .sheet_to_json(workbook.Sheets[sheet])
      ?.filter((item) => item?.["Organization"] === organization),
  }))
}

function parseArguments() {
  const args = process.argv.slice(2)
  const argObject = {}

  args.forEach((arg, index) => {
    if (arg.startsWith("--")) {
      const argName = arg.slice(2)
      const argValue = args[index + 1]
      argObject[argName] = argValue
    }
  })

  return argObject
}

function isS3(path) {
  return path.includes("s3://")
}

console.dir(parseInputFile(), { depth: null })
