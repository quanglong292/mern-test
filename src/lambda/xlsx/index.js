const XLSX = require("xlsx-js-style");
const AWS = require("aws-sdk");

const { utils } = XLSX;

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || "ost-project-testing";

const parseInputFile = async (body, S3) => {
  const filtering = body || {
    organization: "ACS",
    tabs: "IP to MAID Activity, Web Pixel Activity, Audiences Published",
    inputFileKey: "MonthlyUsageReport_April-2024.xlsx",
  };
  console.log("Filtering:", filtering);

  if (!filtering.organization || !filtering.tabs || !filtering.inputFileKey) {
    throw new Error("Missing required arguments");
  }

  // Read the file
  const READ_S3_PARAMS = {
    Bucket: S3_BUCKET_NAME,
    Key: filtering.inputFileKey,
  };
  console.log("Read S3 params -> readInputFile:", READ_S3_PARAMS);
  const took_sheets = await readInputFile(S3, {
    ...filtering,
    ...READ_S3_PARAMS,
  });
  console.log("Took sheets:", took_sheets);

  if (!took_sheets.length) {
    throw new Error("No data found for the given organization");
  }

  // Write the output file
  const currentDate = new Date();
  const fileName = `MonthlyUsageReport_${currentDate.getMonth()}-${currentDate.getFullYear()}-${
    filtering.organization
  }-${new Date().getTime()}.xlsx`;

  let dataForSheet = [];

  took_sheets.forEach((section) => {
    const sectionName = section.sectionName;
    let sectionData = section.sectionData;
    if (!sectionData?.length) return;
    // Section name
    dataForSheet.push([{ v: sectionName, s: { font: { bold: true } } }]);
    dataForSheet.push([]);
    // Get section columns
    const columnNames = Object.keys(sectionData[0]);
    dataForSheet.push(
      columnNames.map((colName) => ({
        v: colName,
        s: { font: { bold: true } },
      }))
    );
    // Add section data
    section.sectionData.forEach((row) => {
      let rowData = [];
      columnNames.forEach((col) => {
        const data = row[col];
        rowData.push(data);
      });
      dataForSheet.push(rowData);
    });

    // Add an empty row between sections
    dataForSheet.push([]);
  });

  console.log("Data for sheet:", dataForSheet);

  let ws = XLSX.utils.aoa_to_sheet(dataForSheet);
  let wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  // Write file to S3
  const WRITE_S3_PARAMS = {
    Bucket: S3_BUCKET_NAME,
    Key: fileName,
    Body: XLSX.write(wb, { bookType: "xlsx", type: "buffer" }),
  };
  console.log("Write S3 params -> parseInputFile:", WRITE_S3_PARAMS);
  const uploadResult = await S3.upload(WRITE_S3_PARAMS).promise();
  console.log("Upload result:", uploadResult);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `File uploaded successfully. ${uploadResult.Location}`,
    }),
  };
};

// --- COMMON FUNCTIONS ---
async function readInputFile(S3, { tabs, organization, Bucket, Key }) {
  try {
    console.log("Read input file params -> readInputFile:", {
      tabs,
      organization,
      Bucket,
      Key,
    });
    // Get the file from S3
    const file = await S3.getObject({ Bucket, Key }).promise();
    const workbook = XLSX.read(file.Body, { type: "buffer" });
    const sheet_name_list = workbook.SheetNames;
    const took_sheet_names = sheet_name_list.filter((sheet) =>
      tabs.includes(sheet)
    );

    return took_sheet_names.map((sheet) => ({
      sectionName: sheet,
      sectionData: utils
        .sheet_to_json(workbook.Sheets[sheet])
        ?.filter((item) => item?.["Organization"] === organization),
    }));
  } catch (error) {
    console.error("An error occurred:", error);
    throw error;
  }
}

// --- export handler function ---
// Node 14.x runtime
exports.handler = async (event) => {
  try {
    console.log("Event:", event);
    const body = event.body;
    console.log("Event body:", body);
    const s3Instance = new AWS.S3({
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
      region: process.env.REGION,
    });
    console.log("S3 instance:", Boolean(s3Instance), {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
      region: process.env.REGION,
    });
    await parseInputFile(body, s3Instance);
  } catch (error) {
    console.error("An error occurred:", error);
    throw error;
  }
};
