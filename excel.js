const xlsx = require("xlsx");
const fs = require("fs");
const chalk = require("chalk");

const bacaFile = (filePath) => {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File input tidak ditemukan: ${filePath}`);
    }
    try {
        const workbook = xlsx.readFile(filePath);
        const targetSheetName = "Pelanggan";
        let worksheet = workbook.Sheets[targetSheetName];

        if (!worksheet) {
            const firstSheetName = workbook.SheetNames[0];
            if (filePath.includes('MASTER_PELANGGAN')) {
                 console.log(chalk.yellow(`\n   > Peringatan: Sheet "${targetSheetName}" tidak ditemukan di ${filePath}. Membaca dari sheet pertama: "${firstSheetName}".`));
            }
            worksheet = workbook.Sheets[firstSheetName];
        }

        if (!worksheet) {
             throw new Error(`Tidak ada sheet yang bisa dibaca di file: ${filePath}`);
        }

        return xlsx.utils.sheet_to_json(worksheet);
    } catch (error) {
        throw new Error(`Gagal membaca file: ${filePath}. Error: ${error.message}`);
    }
};

const bacaLog = (filePath, sheetName) => {
    let data = [];
    let workbook;
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    if (fs.existsSync(filePath)) {
        workbook = xlsx.readFile(filePath);
        if (workbook.SheetNames.includes(sheetName)) {
            data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
        }
    } else {
        workbook = xlsx.utils.book_new();
    }
    return { data, workbook };
};

const bacaSemuaSheetLog = (filePath) => {
    if (!fs.existsSync(filePath)) {
        return { data: {}, workbook: xlsx.utils.book_new() };
    }
    const workbook = xlsx.readFile(filePath);
    const semuaData = {};
    workbook.SheetNames.forEach(sheetName => {
        semuaData[sheetName] = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    });
    return { data: semuaData, workbook };
};

const tulisLog = (filePath, workbook, sheetName, data) => {
    const newWorksheet = xlsx.utils.json_to_sheet(data);
    workbook.Sheets[sheetName] = newWorksheet;
    if (!workbook.SheetNames.includes(sheetName)) {
        workbook.SheetNames.push(sheetName);
    }
    xlsx.writeFile(workbook, filePath);
};

module.exports = { 
    bacaFile, 
    bacaLog, 
    bacaSemuaSheetLog, 
    tulisLog 
};