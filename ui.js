// Nama file: ui.js

const inquirer = require("inquirer");
const chalk = require("chalk");
const cliProgress = require("cli-progress");
const Table = require("cli-table3");
const fs = require("fs");
const config = require("./config.json");

let inquirerInstance, chalkInstance;

async function initializeDependencies() {
    if (!inquirerInstance) inquirerInstance = (await import('inquirer')).default;
    if (!chalkInstance) chalkInstance = (await import('chalk')).default;
}

const formatWaktuProses = (ms) => {
    if (ms < 1000) return `${ms} milidetik`;
    let secs = Math.floor(ms / 1000);
    const hrs = Math.floor(secs / 3600); secs %= 3600;
    const mins = Math.floor(secs / 60); secs %= 60;
    let parts = [];
    if (hrs > 0) parts.push(`${hrs} jam`);
    if (mins > 0) parts.push(`${mins} menit`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs} detik`);
    return parts.join(' ');
};

const dapatkanToken = async () => {
    try {
        if (fs.existsSync(config.filePaths.tokenCache)) {
            const cachedToken = fs.readFileSync(config.filePaths.tokenCache, 'utf-8');
            if (cachedToken) {
                const { useCache } = await inquirerInstance.prompt([{
                    type: 'confirm', name: 'useCache',
                    message: 'Ditemukan token tersimpan, gunakan token tersebut?',
                    default: true
                }]);
                if (useCache) return cachedToken;
            }
        }
    } catch (e) {}

    const { token } = await inquirerInstance.prompt([{
        type: 'password', name: 'token', message: 'Masukkan Bearer Token baru:',
        validate: (input) => (input && input.startsWith('ey')) ? true : 'Token tidak valid.'
    }]);
    fs.writeFileSync(config.filePaths.tokenCache, token, 'utf-8');
    return token;
};

const tampilkanHeader = (version = "v6.0", title = "Sistem Pangkalan Cerdas") => {
    console.clear();
    const border = "=======================================";
    console.log(chalkInstance.bold.cyan(border));
    console.log(chalkInstance.bold.cyan(`   ${title} ${version}`));
    console.log(chalkInstance.bold.cyan(border));
};

const tampilkanDashboard = (profile, productInfo) => {
    console.log(chalkInstance.bold("\n--- Info Sesi Aktif ---"));
    const table = new Table({ style: { 'padding-left': 1, 'padding-right': 1, border: [], header: [] } });
    table.push(
        { [chalkInstance.blue('Pangkalan')]: chalkInstance.green(profile.storeName) },
        { [chalkInstance.blue('Stok Tersisa')]: chalkInstance.bold.green(productInfo?.stockAvailable ?? 'N/A') }
    );
    console.log(table.toString());
};

const tampilkanMenuUtama = () => inquirerInstance.prompt([{
    type: 'list', name: 'menuChoice', message: 'Pilih tindakan:',
    choices: [
        new inquirerInstance.Separator(chalkInstance.bold.cyan('--- Proses Transaksi ---')),
        { name: '1. Buat Rencana Transaksi (Otomatis)', value: '1' },
        { name: '2. Validasi File Rencana Transaksi', value: '2' },
        { name: '3. Eksekusi Rencana Transaksi', value: '3' },
        { name: '4. Transaksi Langsung (On-The-Spot)', value: '4' },
        { name: '5. Input Transaksi Manual (dari File)', value: '5' },
        new inquirerInstance.Separator(chalkInstance.bold.cyan('--- Utilitas & Laporan ---')),
        { name: '6. Perbarui Kuota Seluruh Pelanggan', value: '6' },
        { name: '7. Tampilkan Laporan Penjualan Bulan Ini', value: '7' },
        { name: '8. Buat File Template Input', value: '8' },
        new inquirerInstance.Separator(),
        { name: '9. Ganti Token / Pangkalan', value: '9' },
        { name: '10. Keluar', value: '10' },
    ]
}]);

const promptPilihRentangTanggal = async () => {
    const { pilihan } = await inquirerInstance.prompt([{
        type: 'list', name: 'pilihan', message: 'Pilih periode laporan:',
        choices: ['Bulan Ini', 'Kemarin', 'Pilih Tanggal Kustom']
    }]);

    if (pilihan === 'Bulan Ini') {
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        return { startDate, endDate: today };
    }
    if (pilihan === 'Kemarin') {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return { startDate: yesterday, endDate: yesterday };
    }
    // Pilihan Tanggal Kustom
    const { tglMulai, tglSelesai } = await inquirerInstance.prompt([
        { type: 'input', name: 'tglMulai', message: 'Masukkan Tanggal Mulai (YYYY-MM-DD):', validate: input => /\d{4}-\d{2}-\d{2}/.test(input) ? true : "Format salah." },
        { type: 'input', name: 'tglSelesai', message: 'Masukkan Tanggal Selesai (YYYY-MM-DD):', validate: input => /\d{4}-\d{2}-\d{2}/.test(input) ? true : "Format salah." }
    ]);
    return { startDate: new Date(tglMulai), endDate: new Date(tglSelesai) };
};

const promptTransaksiLangsung = async () => {
    return inquirerInstance.prompt([
        {
            type: 'input', name: 'nik', message: '➡️ Masukkan NIK Pelanggan (16 digit):',
            validate: (input) => /^\d{16}$/.test(input) ? true : 'Format NIK salah, harus 16 digit angka.'
        },
        {
            type: 'number', name: 'quantity', message: '➡️ Masukkan Jumlah Pembelian (quantity):',
            default: 1,
            validate: (input) => input > 0 ? true : 'Jumlah harus lebih dari 0.'
        }
    ]);
};

const buatProgressBar = (pesan = 'Proses') => new cliProgress.SingleBar({
    format: `${pesan} |${chalkInstance.cyan('{bar}')}| {percentage}% || {value}/{total} Data`,
    barCompleteChar: '\u2588', barIncompleteChar: '\u2591', hideCursor: true
}, cliProgress.Presets.shades_classic);

const tampilkanTabelRingkasan = (summary, title = 'Ringkasan Proses') => {
    console.log(chalkInstance.bold(`\n--- ${title} ---`));
    const table = new Table({ head: [chalkInstance.cyan('Status'), chalkInstance.cyan('Jumlah')], colWidths: [35, 10] });
    let total = 0;
    for (const [status, count] of Object.entries(summary)) {
        if (count === 0) continue;
        let coloredStatus = status;
        if (status.toLowerCase().includes('sukses')) coloredStatus = chalkInstance.green(status);
        if (status.toLowerCase().includes('gagal')) coloredStatus = chalkInstance.red(status);
        if (status.toLowerCase().includes('dilewati')) coloredStatus = chalkInstance.yellow(status);
        table.push([coloredStatus, count]);
        total += count;
    }
    table.push([chalkInstance.bold('Total'), chalkInstance.bold(total)]);
    console.log(table.toString());
};

const tampilkanTabelLaporan = (sortedData) => {
    const table = new Table({ head: [chalkInstance.cyan('NIK'), chalkInstance.cyan('Nama'), chalkInstance.cyan('Kategori'), chalkInstance.cyan('Total Beli (Tabung)')] });
    sortedData.forEach(([nik, data]) => {
        table.push([nik, data.nama, data.kategori, data.total]);
    });
    console.log(table.toString());
};

module.exports = {
    initializeDependencies, formatWaktuProses, dapatkanToken, tampilkanHeader,
    tampilkanDashboard, tampilkanMenuUtama, buatProgressBar, tampilkanTabelRingkasan,
    promptTransaksiLangsung,tampilkanTabelLaporan, promptPilihRentangTanggal,
};