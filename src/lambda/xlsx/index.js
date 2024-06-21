const XLSX = require("xlsx-js-style");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { defaultProvider } = require("@aws-sdk/credential-provider-node");
const path = require("node:path");
const fs = require("fs");

const { utils } = XLSX;
const cwd = process.cwd();

const parseInputFile = async (body, s3Instance) => {
  const isS3Enabled = isS3(body?.inputFilePath);
  const isS3OutputEnabled = isS3(body?.outputPath)
  const inputFile = s3PathParser(body?.inputFilePath);
  const dspInputFile = s3PathParser(body?.dspInputFile);
  const isDSPInclude = Boolean(body?.dspInputFile);
  const outputPath = s3PathParser(body?.outputPath);

  console.log("paths -->", { inputFile, dspInputFile, outputPath });

  if (!fs.existsSync(outputPath.path) && !isS3Enabled) {
    fs.mkdirSync(outputPath.path, { recursive: true });
  }

  let organizations = body.organizations?.map((i) => i.toLowerCase());

  // Read the file
  let { took_sheets, orgs } = await readInputFile(s3Instance, {
    ...body,
    Bucket: inputFile.Bucket,
    Key: inputFile.Key,
  });

  if (organizations === undefined || !organizations?.length)
    organizations = orgs ?? [];

  const psdSheet = await readCSVFile(s3Instance, {
    ...body,
    organizations,
    Bucket: dspInputFile.Bucket,
    Key: dspInputFile.Key,
  });

  if (isDSPInclude) took_sheets = [psdSheet, ...took_sheets];

  // Write the output file
  for (const org of organizations) {
    const currentDate = new Date();
    const fileName = `MonthlyUsageReport_${currentDate.getMonth()}-${currentDate.getFullYear()}-${org?.toUpperCase()}-${new Date().getTime()}.xlsx`;

    const dataForSheet = [];

    took_sheets.forEach((section) => {
      const sectionName = section.sectionName;
      let sectionData = section.sectionData?.filter(
        (i) =>
          (i?.["Organization"] || i?.["Org: Name"])?.toLowerCase() ===
          org.toLowerCase()
      );
      if (!sectionData.length) sectionData = [{ "# No data": undefined }];
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
      sectionData.forEach((row) => {
        const rowData = [];
        columnNames.forEach((col) => {
          let data = row[col];

          if (!isNaN(Number(data))) data = Number(data).toLocaleString();

          rowData.push(data);
        });
        dataForSheet.push(rowData);
      });

      // Add an empty row between sections
      dataForSheet.push([]);
    });

    // Check if no data -> no generate file
    const isEmptyFile = !dataForSheet
      .flat()
      .find((i) => Boolean(i) && typeof i === "string" && Number(i) > 0);
    if (isEmptyFile) continue;

    const ws = XLSX.utils.aoa_to_sheet(dataForSheet);
    ws["!cols"] = generateColWidth(dataForSheet);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

    if (isS3OutputEnabled) {
      // Write file to s3Instance
      const WRITE_S3_PARAMS = {
        Bucket: outputPath.Bucket,
        Key: outputPath.Key + fileName,
        Body: XLSX.write(wb, { bookType: "xlsx", type: "buffer" }),
      };
      await s3Instance.send(new PutObjectCommand(WRITE_S3_PARAMS)); // V3
    } else {
      XLSX.writeFile(wb, path.resolve(cwd, outputPath.path, fileName));
    }
    console.log("Generated:", org);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Files uploaded successfully.",
    }),
  };
};

// --- COMMON FUNCTIONS ---

async function readInputFile(
  S3,
  { tabs, organizations, inputFilePath, Bucket, Key }
) {
  try {
    const isS3Enabled = isS3(inputFilePath);

    const file = isS3Enabled
      ? await S3.send(new GetObjectCommand({ Bucket, Key }))
      : path.resolve(cwd, inputFilePath);

    let workbook = null;
    try {
      workbook = isS3Enabled
        ? XLSX.read(file.Body, { type: "buffer" })
        : XLSX.readFile(file);
    } catch (_) {
      throw new Error("File not exist!");
    }

    const sheet_name_list = workbook.SheetNames;
    let took_sheet_names = !tabs?.length
      ? sheet_name_list
      : sheet_name_list.filter((sheet) => tabs.includes(sheet));

    if (!took_sheet_names?.length) took_sheet_names = sheet_name_list;

    const returnData = took_sheet_names.map((sheet) => {
      const data = utils.sheet_to_json(workbook.Sheets[sheet]);
      return {
        sectionName: sheet,
        sectionData: !organizations?.length
          ? data
          : data?.filter((item) =>
              organizations.includes(item?.["Organization"]?.toLowerCase())
            ),
      };
    });

    return {
      took_sheets: returnData,
      orgs: !organizations?.length
        ? utils
            .sheet_to_json(workbook.Sheets["Summary"])
            ?.map((i) => i?.["Organization"]?.toLowerCase())
        : organizations,
    };
  } catch (error) {
    console.error("An error occurred:", error);
    throw error;
  }
}

async function readCSVFile(S3, { organizations, dspInputFile, Bucket, Key }) {
  try {
    const isS3Enabled = isS3(dspInputFile);

    const file = isS3Enabled
      ? await S3.send(new GetObjectCommand({ Bucket, Key }))
      : path.resolve(cwd, dspInputFile);

    let workbook = null;

    try {
      workbook = isS3Enabled
        ? XLSX.read(file.Body, { type: "buffer" })
        : XLSX.readFile(file);
    } catch (_) {
      throw new Error("File not exist!");
    }

    const sheet_names = workbook.SheetNames[0];
    const sheet_data = {
      sectionName: "DSP Usage",
      sectionData: XLSX.utils
        .sheet_to_json(workbook.Sheets[sheet_names])
        ?.map((i) => {
          delete i.rowNumber;
          return i;
        })
        ?.filter((i) => {
          return organizations.includes(
            (i?.["Org: Name"] || i?.["Organization"])?.toLowerCase()
          );
        }),
    };

    return sheet_data;
  } catch (error) {
    console.error("A readCSVFile error occurred:", error);
    throw error;
  }
}

function isS3(path) {
  return path?.startsWith("s3://");
}

function s3PathParser(inputPath) {
  console.log("s3PathParser -->", inputPath);
  if (isS3(inputPath)) {
    const [_, __, Bucket, ...rawKeys] = inputPath.split("/");
    const Key = rawKeys.join("/");

    return { Bucket, Key, path: inputPath };
  }
  return { path: path.resolve(cwd, inputPath) };
}

function parseArguments() {
  const args = process.argv.slice(2);
  const argObject = {};

  args.forEach((arg, index) => {
    if (arg.startsWith("--")) {
      const argName = arg.slice(2);
      const argValue = args[index + 1];
      argObject[argName] = argValue;
    }
  });

  return argObject;
}

function generateColWidth(rows) {
  const cols = Math.max(...rows.map((row) => row.length));
  const wscols = Array(cols)
    .fill("")
    .map((_, index) => {
      const cells = rows
        .map((row) => {
          const currentCell = row[index];
          return currentCell?.v ? currentCell?.v?.length : currentCell?.length;
        })
        ?.filter((i) => i);
      const longestChars = Math.max(...cells);
      return { wch: longestChars };
    });

  return wscols;
}

function parseBody(event) {
  const body = event?.body || parseArguments();

  if (!body?.inputFilePath || !body?.outputPath) {
    throw new Error("Missing required arguments!");
  }

  if (body.tabs) {
    const newTabs =
      typeof body.tabs === "string"
        ? body?.tabs?.split(",")?.map((i) => i?.trim()) || []
        : body.tabs?.length
        ? body.tabs
        : [];
    body.tabs = newTabs.filter((i) => Boolean(i));
  } else body.tabs = [];

  if (body.organizations) {
    const newTabs =
      typeof body.organizations === "string"
        ? body?.organizations?.split(",")?.map((i) => i?.trim()) || []
        : body.organizations?.length
        ? body.organizations
        : [];
    body.organizations = newTabs.filter((i) => Boolean(i));
  } else body.organizations = [];

  return body;
}

// --- export handler function ---
const handler = async (event) => {
  try {
    const body = parseBody(event);
    const s3Instance = new S3Client({
      region: process.env.REGION,
      credentials: defaultProvider(),
    });
    console.log("Event body:", body);
    await parseInputFile(body, s3Instance);
  } catch (error) {
    console.error("An error occurred:", error);
    throw error;
  }
};

if (!process.env.AWS_EXECUTION_ENV?.includes("Lambda")) {
  handler();
}

exports.handler = handler;
