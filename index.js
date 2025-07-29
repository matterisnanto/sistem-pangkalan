// Nama file: index.js

// -----------------------------------------------------------------------------
// --- Impor Modul & Konfigurasi ---
// -----------------------------------------------------------------------------
const api = require('./api');
const excel = require('./excel');
const ui = require('./ui');
const config = require('./config.json');

const fs = require('fs');
const xlsx = require('xlsx');
let chalk, inquirer;

// -----------------------------------------------------------------------------
// --- Fungsi Bantuan ---
// -----------------------------------------------------------------------------
const jeda = (minDetik, maksDetik) => {
    const durasi = (Math.floor(Math.random() * (maksDetik - minDetik + 1)) + minDetik) * 1000;
    if (durasi > 0) {
        console.log(chalk.gray(`   ⏸️  Jeda acak selama ${durasi / 1000} detik...`));
    }
    return new Promise(resolve => setTimeout(resolve, durasi));
};

async function runBuatMasterPelanggan() {
    const startTime = Date.now();
    console.log(chalk.bold.yellow("\n--- [Utilitas] Membuat/Memperbarui Master Pelanggan ---"));

    console.log(chalk.blue("1. Memindai seluruh data transaksi dari semua pangkalan..."));
    const { data: semuaLog } = excel.bacaSemuaSheetLog(config.filePaths.masterLogTransaksi);

    const pelangganMap = new Map();
    let totalTransaksiDibaca = 0;

    for (const pangkalan in semuaLog) {
        semuaLog[pangkalan].forEach(row => {
            if (!row.noKTP || !row.nama || row.nama === 'Akan diverifikasi') return;
            totalTransaksiDibaca++;
            const nik = String(row.noKTP);
            
            const dataPelangganSaatIni = pelangganMap.get(nik);
            const tanggalBaru = new Date(row.tanggal_transaksi.split(',')[0].split('/').reverse().join('-'));

            if (!dataPelangganSaatIni || tanggalBaru > new Date(dataPelangganSaatIni.tanggal_terakhir_transaksi.split(',')[0].split('/').reverse().join('-'))) {
                pelangganMap.set(nik, {
                    noKTP: nik,
                    nama: row.nama,
                    customerTypes: row.customerTypes,
                    tanggal_terakhir_transaksi: row.tanggal_transaksi,
                });
            }
        });
    }

    if (pelangganMap.size === 0) {
        console.log(chalk.yellow("Tidak ada data valid di master log untuk diproses."));
        return;
    }

    const dataPelanggan = Array.from(pelangganMap.values());
    excel.tulisLog(config.filePaths.masterPelanggan, xlsx.utils.book_new(), "Pelanggan", dataPelanggan);

    console.log(chalk.green.bold(`\n✅ File "${config.filePaths.masterPelanggan}" berhasil dibuat/diperbarui!`));
    console.log(`   > Diproses ${totalTransaksiDibaca} baris transaksi.`);
    console.log(`   > Ditemukan dan disimpan ${dataPelanggan.length} pelanggan unik.`);
    console.log(`⏱️  Waktu Proses: ${ui.formatWaktuProses(Date.now() - startTime)}`);
}


async function backupMasterLog() {
    const filePath = config.filePaths.masterLogTransaksi;
    if (!fs.existsSync(filePath)) return; // Tidak ada yang perlu di-backup

    const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
    const backupPath = filePath.replace('.xlsx', `_backup_${timestamp}.xlsx`);
    fs.copyFileSync(filePath, backupPath);
    console.log(chalk.gray(`   > Backup master log dibuat di: ${backupPath}`));
}

async function runTambahPelangganBaru(token) {
    const startTime = Date.now();
    console.log(chalk.bold.yellow("\n--- [Manajemen] Menambahkan Pelanggan Baru dari File ---"));

    const dataPelangganBaru = excel.bacaFile(config.filePaths.inputFilePelangganBaru);
    if (!dataPelangganBaru) {
        console.log(chalk.red(`   Buat file "${config.filePaths.inputFilePelangganBaru}" dengan satu kolom "noKTP".`));
        return;
    }

    const dataPelanggan = excel.bacaFile(config.filePaths.masterPelanggan) || [];
    const pelangganSet = new Set(dataPelanggan.map(p => String(p.noKTP)));

    const summary = { 'Baru Ditambahkan': 0, 'Sudah Ada (Dilewati)': 0, 'Verifikasi Gagal': 0 };
    const progressBar = ui.buatProgressBar('Memproses NIK Baru');
    progressBar.start(dataPelangganBaru.length, 0);

    let adaDataBaru = false;

    for (const [index, user] of dataPelangganBaru.entries()) {
        progressBar.increment();
        const nik = String(user.noKTP);
        if (!nik || !/^\d{16}$/.test(nik)) {
            summary['Verifikasi Gagal']++;
            continue;
        }

        if (pelangganSet.has(nik)) {
            summary['Sudah Ada (Dilewati)']++;
            continue;
        }

        const verificationData = await api.getVerificationData(nik, token);
        if (verificationData) {
            // [PERBAIKAN] Langsung ambil data kuota saat verifikasi berhasil
            const quota = await api.getQuota(nik, verificationData, token);
            
            const custType = verificationData.customerTypes?.[0]?.name || 'N/A';
            dataPelanggan.push({
                noKTP: nik,
                nama: verificationData.name,
                customerTypes: custType,
                tanggal_terakhir_transaksi: 'Belum Pernah Transaksi',
                // --- [DATA KUOTA BARU DITAMBAHKAN] ---
                daily: quota?.daily ?? 0,
                monthly: quota?.monthly ?? 0,
                family: quota?.family ?? 'N/A',
                all: quota?.all ?? 0
            });
            pelangganSet.add(nik);
            summary['Baru Ditambahkan']++;
            adaDataBaru = true;
        } else {
            summary['Verifikasi Gagal']++;
        }

        if (index < dataPelangganBaru.length - 1) {
            await jeda(config.jeda.cekKuota.minDetik, config.jeda.cekKuota.maksDetik);
        }
    }
    progressBar.stop();

    if (adaDataBaru) {
        excel.tulisLog(config.filePaths.masterPelanggan, xlsx.utils.book_new(), "Pelanggan", dataPelanggan);
        console.log(chalk.green.bold("\n\n✅ Master Pelanggan berhasil diperbarui."));
    } else {
        console.log(chalk.yellow("\n\nTidak ada pelanggan baru yang ditambahkan."));
    }

    ui.tampilkanTabelRingkasan(summary, "Ringkasan Penambahan Pelanggan");
    console.log(`⏱️  Waktu Proses: ${ui.formatWaktuProses(Date.now() - startTime)}`);
}                                                                                                                                  

// -----------------------------------------------------------------------------
// --- FUNGSI-FUNGSI MODE CERDAS ---
// -----------------------------------------------------------------------------

async function runTransaksiLangsung(token, profile) {
    const startTime = Date.now();
    console.log(chalk.bold.yellow("\n--- [Transaksi Langsung] Input On-The-Spot ---"));

    try {
        const { nik, quantity } = await ui.promptTransaksiLangsung();
        
        console.log(chalk.blue("\nMemproses transaksi..."));
        
        const productInfo = await api.getProducts(token);
        if (quantity > productInfo.stockAvailable) {
            throw new Error("Stok tidak cukup untuk transaksi ini.");
        }

        const sheetName = profile.storeName.replace(/[\\/*?:"\[\]]/g, '').substring(0, 31);
        const { data: historicalData, workbook } = excel.bacaLog(config.filePaths.masterLogTransaksi, sheetName);
        
        const currentMonth = new Date().getMonth();
        const usageMap = new Map();
        historicalData
            .filter(row => row.status?.startsWith('Sukses') && new Date(row.tanggal_transaksi.split(',')[0].split('/').reverse().join('-')).getMonth() === currentMonth)
            .forEach(row => usageMap.set(String(row.noKTP), (usageMap.get(String(row.noKTP)) || 0) + 1));

        const verificationData = await api.getVerificationData(nik, token);
        if (!verificationData) throw new Error("Verifikasi NIK Gagal / NIK tidak terdaftar");

        const custType = verificationData.customerTypes?.[0]?.name || 'N/A';
        const monthlyLimit = (custType === 'Usaha Mikro') ? config.aturanBisnis.batasUsahaMikro : config.aturanBisnis.batasPerPangkalan;

        if ((usageMap.get(nik) || 0) >= monthlyLimit) {
            throw new Error(`Batas ${monthlyLimit} transaksi/bulan untuk pelanggan ini sudah tercapai.`);
        }

        const sourceTypeIdValue = (custType === 'Usaha Mikro') ? 2 : 1;
        const payload = {
            products: [{ productId: productInfo.productId, quantity }], token: verificationData.token,
            subsidi: { nik, familyIdEncrypted: verificationData.familyIdEncrypted, category: custType, nama: verificationData.name, channelInject: "tnp2k", sourceTypeId: sourceTypeIdValue },
        };

        const trxData = await api.postTransaction(payload, token);
        if (!trxData.success) throw new Error(trxData.message || "TRANSACTION_INVALID");

        const resultRow = {
            noKTP: nik, nama: verificationData.name, customerTypes: custType,
            status: `Sukses - ID: ${trxData.data.transactionId}`,
            tanggal_transaksi: new Date().toLocaleString('id-ID', {timeZone: 'Asia/Jakarta'}),
            pangkalan: profile.storeName, quantity,
        };
        
        historicalData.push(resultRow);
        excel.tulisLog(config.filePaths.masterLogTransaksi, workbook, sheetName, historicalData);
        
        console.log(chalk.green.bold(`\n✅ Transaksi untuk ${verificationData.name} berhasil!`));
        console.log(`   Stok tersisa: ${productInfo.stockAvailable - quantity}`);
        
    } catch (error) {
        console.log(chalk.red.bold(`\n❌ Gagal: ${error.message}`));
        // Juga catat kegagalan ke log jika perlu
    }
    
    console.log(`⏱️  Waktu Proses: ${ui.formatWaktuProses(Date.now() - startTime)}`);
}

async function buatRencanaTransaksi(token, profile) {
    const startTime = Date.now();
    console.log(chalk.bold.yellow("\n--- [Cerdas] Membuat Rencana Transaksi Harian ---"));
    
    const dataPelanggan = excel.bacaFile(config.filePaths.masterPelanggan);
    if (!dataPelanggan) {
        console.log(chalk.red.bold(`\n❌ File master pelanggan tidak ditemukan. Jalankan menu "Buat/Update Master Pelanggan" terlebih dahulu.`));
        return;
    }
    
    const { totalStock } = await inquirer.prompt([{
        type: 'number', name: 'totalStock',
        message: `Masukkan total stok yang akan didistribusikan untuk ${chalk.cyan(profile.storeName)}:`,
        validate: (input) => input > 0 ? true : "Jumlah stok harus lebih dari 0."
    }]);

    console.log(chalk.blue("\n1. Membaca data transaksi bulan ini..."));
    const { data: semuaLog } = excel.bacaSemuaSheetLog(config.filePaths.masterLogTransaksi);
    const globalUsageMap = new Map();
    const currentMonth = new Date().getMonth();
    for (const pangkalanSheet in semuaLog) {
        semuaLog[pangkalanSheet]
            .filter(row => row.status?.startsWith('Sukses') && new Date(row.tanggal_transaksi.split(',')[0].split('/').reverse().join('-')).getMonth() === currentMonth)
            .forEach(row => {
                const nik = String(row.noKTP);
                const pangkalanUsage = globalUsageMap.get(nik) || new Map();
                pangkalanUsage.set(pangkalanSheet, (pangkalanUsage.get(pangkalanSheet) || 0) + 1);
                globalUsageMap.set(nik, pangkalanUsage);
            });
    }

    console.log(chalk.blue("\n2. Melakukan filter cepat berdasarkan data tersimpan..."));
    const sheetName = profile.storeName.replace(/[\\/*?:"\[\]]/g, '').substring(0, 31);
    
    let kandidatPelanggan = dataPelanggan.filter(pelanggan => {
        const nik = String(pelanggan.noKTP);
        const usageDiPangkalanIni = globalUsageMap.get(nik)?.get(sheetName) || 0;
        const limitPangkalan = (pelanggan.customerTypes === 'Usaha Mikro') ? config.aturanBisnis.batasUsahaMikro : config.aturanBisnis.batasPerPangkalan;
        return usageDiPangkalanIni < limitPangkalan && !(typeof pelanggan.monthly === 'number' && pelanggan.monthly <= 0);
    });
    console.log(chalk.gray(`   > Ditemukan ${kandidatPelanggan.length} kandidat awal.`));
    
    console.log(chalk.blue("\n3. Melakukan Pembaruan Cerdas (Smart Update) pada kandidat..."));
    const eligibleCustomers = [];
    const progressBar = ui.buatProgressBar('Update Cerdas');
    progressBar.start(kandidatPelanggan.length, 0);

    for (const [index, pelanggan] of kandidatPelanggan.entries()) {
        progressBar.increment();
        const nik = String(pelanggan.noKTP);

        let isDataFresh = false;
        if (pelanggan.terakhir_dicek) {
            const lastCheckedDate = new Date(pelanggan.terakhir_dicek);
            // [PERBAIKAN] Cek apakah tanggal valid sebelum menghitung selisih
            if (!isNaN(lastCheckedDate)) {
                const hoursDiff = (new Date() - lastCheckedDate) / (1000 * 60 * 60);
                if (hoursDiff < config.aturanBisnis.masaBerlakuCacheKuotaJam) {
                    isDataFresh = true;
                }
            }
        }

        if (isDataFresh) {
            if (pelanggan.monthly > 0) {
                eligibleCustomers.push({ ...pelanggan, usage: globalUsageMap.get(nik)?.get(sheetName) || 0 });
            }
        } else {
            const verificationData = await api.getVerificationData(nik, token);
            if (verificationData) {
                const quota = await api.getQuota(nik, verificationData, token);
                if (quota) {
                    pelanggan.daily = quota.daily; 
                    pelanggan.monthly = quota.monthly;
                    pelanggan.family = quota.family; 
                    pelanggan.all = quota.all;
                    pelanggan.terakhir_dicek = new Date().toISOString();
                    
                    if (quota.monthly > 0) {
                        eligibleCustomers.push({ ...pelanggan, usage: globalUsageMap.get(nik)?.get(sheetName) || 0 });
                    }
                }
            }
            if (index < kandidatPelanggan.length - 1) {
                await jeda(config.jeda.cekKuota.minDetik, config.jeda.cekKuota.maksDetik);
            }
        }
    }
    progressBar.stop();
    
    console.log(chalk.blue("\n4. Menyimpan hasil Pembaruan Cerdas ke Master Pelanggan..."));
    excel.tulisLog(config.filePaths.masterPelanggan, xlsx.utils.book_new(), "Pelanggan", dataPelanggan);

    if (eligibleCustomers.length === 0) {
        console.log(chalk.yellow("\nTidak ditemukan pelanggan yang memenuhi syarat setelah verifikasi API."));
        return;
    }
    
    eligibleCustomers.sort((a, b) => a.usage - b.usage);
    const pelangganTerpilih = eligibleCustomers.slice(0, totalStock).map(p => ({
        noKTP: p.noKTP,
        nama: p.nama,
        customerTypes: p.customerTypes,
        sisa_kuota_harian: p.daily,
        sisa_kuota_bulanan: p.monthly,
        sisa_kuota_keluarga: p.family,
        quantity: 1
    }));
    console.log(chalk.green(`\n5. Berhasil menemukan ${eligibleCustomers.length} pelanggan, ${pelangganTerpilih.length} dipilih untuk rencana.`));
    excel.tulisLog(config.filePaths.rencanaTransaksi, xlsx.utils.book_new(), "Rencana", pelangganTerpilih);
    
    console.log(chalk.bold.green(`\n✅ File "${config.filePaths.rencanaTransaksi}" berhasil dibuat.`));
    console.log(`   Silakan periksa dan sesuaikan file tersebut sebelum dieksekusi.`);
    console.log(`⏱️  Waktu Proses: ${ui.formatWaktuProses(Date.now() - startTime)}`);
}

async function eksekusiRencanaTransaksi(token, profile) {
    const startTime = Date.now();
    console.log(chalk.bold.yellow(`\n--- [Cerdas] Eksekusi Rencana Transaksi ---`));
    
    const dataToInput = excel.bacaFile(config.filePaths.rencanaTransaksi);
    if (!dataToInput) {
        console.log(chalk.red(`Pastikan file "${config.filePaths.rencanaTransaksi}" sudah ada.`));
        return;
    }
    
    const { summary, sisaStok } = await runTransactionInputProcess(token, profile, dataToInput);
    
    if (sisaStok > 0) {
        console.log(chalk.yellow.bold(`\n Terdapat ${sisaStok} sisa stok dari transaksi yang gagal/dilewati.`));
        const { alokasi } = await inquirer.prompt([{
            type: 'confirm', name: 'alokasi', 
            message: `Apakah Anda ingin mencari ${sisaStok} pelanggan lain untuk sisa stok ini?`,
            default: true
        }]);
        if (alokasi) {
            const niksSudahProses = new Set(dataToInput.map(u => String(u.noKTP)));
            await alokasiSisaStok(token, profile, sisaStok, niksSudahProses);
        }
    }

    console.log(`\n⏱️  Total Waktu Eksekusi: ${ui.formatWaktuProses(Date.now() - startTime)}`);
}

async function alokasiSisaStok(token, profile, sisaStok, niksSudahProses) {
    console.log(chalk.bold.yellow("\n--- [Cerdas] Mencari Pelanggan Pengganti untuk Sisa Stok ---"));
    const startTime = Date.now();

    console.log(chalk.blue("1. Memindai ulang seluruh data transaksi..."));
    const { data: semuaLog } = excel.bacaSemuaSheetLog(config.filePaths.masterLogTransaksi);
    
    const globalUsageMap = new Map();
    const uniqueNikSet = new Set();
    const currentMonth = new Date().getMonth();

    for (const pangkalanSheet in semuaLog) {
        semuaLog[pangkalanSheet]
            .filter(row => row.status?.startsWith('Sukses') && new Date(row.tanggal_transaksi.split(',')[0].split('/').reverse().join('-')).getMonth() === currentMonth)
            .forEach(row => {
                const nik = String(row.noKTP);
                uniqueNikSet.add(nik);
                const pangkalanUsage = globalUsageMap.get(nik) || new Map();
                pangkalanUsage.set(pangkalanSheet, (pangkalanUsage.get(pangkalanSheet) || 0) + 1);
                globalUsageMap.set(nik, pangkalanUsage);
            });
    }

    console.log(chalk.blue(`\n2. Memfilter ${uniqueNikSet.size} pelanggan untuk mencari ${sisaStok} pengganti...`));
    const eligibleCustomers = [];
    const progressBar = ui.buatProgressBar('Mencari');
    const allNiks = Array.from(uniqueNikSet);
    progressBar.start(allNiks.length, 0);

    const sheetName = profile.storeName.replace(/[\\/*?:"\[\]]/g, '').substring(0, 31);

    for (const nik of allNiks) {
        progressBar.increment();
        if (niksSudahProses.has(nik)) continue;

        const verificationData = await api.getVerificationData(nik, token);
        if (!verificationData) continue;

        const quota = await api.getQuota(nik, verificationData, token);
        if (!quota || quota.monthly <= 0) continue;

        const usageDiPangkalanIni = globalUsageMap.get(nik)?.get(sheetName) || 0;
        const custType = verificationData.customerTypes?.[0]?.name || 'N/A';
        const limitPangkalan = (custType === 'Usaha Mikro') ? config.aturanBisnis.batasUsahaMikro : config.aturanBisnis.batasPerPangkalan;
        
        if (usageDiPangkalanIni < limitPangkalan) {
            eligibleCustomers.push({ noKTP: nik, quantity: 1, usage: usageDiPangkalanIni });
        }
    }
    progressBar.stop();

    if(eligibleCustomers.length === 0) {
        console.log(chalk.yellow("\nTidak ditemukan lagi pelanggan pengganti yang memenuhi syarat."));
        return;
    }

    eligibleCustomers.sort((a, b) => a.usage - b.usage);
    const pelangganTambahan = eligibleCustomers.slice(0, sisaStok).map(p => ({
        noKTP: p.noKTP,
        nama: p.nama,
        customerTypes: p.customerTypes,
        sisa_kuota_harian: p.daily,
        sisa_kuota_bulanan: p.monthly,
        sisa_kuota_keluarga: p.family,
        quantity: 1
    })); 
    const fileTambahan = "input/rencana_tambahan.xlsx";
    excel.tulisLog(fileTambahan, xlsx.utils.book_new(), "Rencana Tambahan", pelangganTambahan);
    
    console.log(chalk.bold.green(`\n✅ File "${fileTambahan}" berhasil dibuat dengan ${pelangganTambahan.length} pelanggan baru.`));
    console.log(chalk.cyan(`   Untuk melanjutkan, ubah nama file ini menjadi "${config.filePaths.rencanaTransaksi}" dan jalankan lagi menu "Eksekusi Rencana".`));
    console.log(`⏱️  Waktu Proses: ${ui.formatWaktuProses(Date.now() - startTime)}`);
}

// -----------------------------------------------------------------------------
// --- FUNGSI-FUNGSI INTI & MODE KLASIK ---
// -----------------------------------------------------------------------------

async function runManajemenTemplate() {
    const startTime = Date.now();
    console.log(chalk.bold.yellow("\n--- [Utilitas] Membuat File Template Input ---"));

    // Template untuk Rencana Transaksi
    const pathRencana = config.filePaths.rencanaTransaksi;
    if (!fs.existsSync(pathRencana)) {
        const templateData = [{
            noKTP: '1234567890123456',
            nama: 'NAMA PELANGGAN',
            customerTypes: 'Rumah Tangga',
            quantity: 1,
            sisa_kuota_harian: 1,
            sisa_kuota_bulanan: 4,
            sisa_kuota_keluarga: 4
        }];
        excel.tulisLog(pathRencana, xlsx.utils.book_new(), "Rencana", templateData);
        console.log(chalk.green(`   ✅ Template "${pathRencana}" berhasil dibuat.`));
    } else {
        console.log(chalk.gray(`   ℹ️  File "${pathRencana}" sudah ada.`));
    }

    // Template untuk Input Manual (jika masih diperlukan)
    const pathManual = config.filePaths.inputFileTransaksi;
    if (!fs.existsSync(pathManual)) {
        const templateData = [{ noKTP: '1234567890123456', quantity: 1 }];
        excel.tulisLog(pathManual, xlsx.utils.book_new(), "Sheet1", templateData);
        console.log(chalk.green(`   ✅ Template "${pathManual}" berhasil dibuat.`));
    } else {
        console.log(chalk.gray(`   ℹ️  File "${pathManual}" sudah ada.`));
    }
    
    console.log(`\n⏱️  Waktu Proses: ${ui.formatWaktuProses(Date.now() - startTime)}`);
}

async function runTransactionInputProcess(token, profile, dataDariRencana = null) {
    const startTime = Date.now();
    const isModeCerdas = !!dataDariRencana;
    
    if (!isModeCerdas) {
        console.log(chalk.bold.yellow(`\n--- [Utilitas] Input Transaksi Manual ---`));
    }

    // [PERBAIKAN] Muat data master pelanggan di awal fungsi
    const pathMasterPelanggan = config.filePaths.masterPelanggan;
    let dataPelanggan = excel.bacaFile(pathMasterPelanggan) || [];
    const pelangganSet = new Set(dataPelanggan.map(p => String(p.noKTP)));

    let productInfo;
    try {
        productInfo = await api.getProducts(token);
    } catch (error) {
        console.log(chalk.red.bold(`\n❌ Error memuat info produk: ${error.message}`));
        return { summary: {}, sisaStok: 0 };
    }

    const sheetName = profile.storeName.replace(/[\\/*?:"\[\]]/g, '').substring(0, 31);
    const { data: historicalData, workbook } = excel.bacaLog(config.filePaths.masterLogTransaksi, sheetName);
    const dataToInput = dataDariRencana || excel.bacaFile(config.filePaths.inputFileTransaksi);

    if (!dataToInput) return { summary: {}, sisaStok: 0 };

    const currentMonth = new Date().getMonth();
    const usageMap = new Map();
    historicalData
        .filter(row => row.status?.startsWith('Sukses') && new Date(row.tanggal_transaksi.split(',')[0].split('/').reverse().join('-')).getMonth() === currentMonth)
        .forEach(row => usageMap.set(String(row.noKTP), (usageMap.get(String(row.noKTP)) || 0) + 1));

    let currentStock = productInfo.stockAvailable;
    const summary = { 'Sukses': 0, 'Gagal (Verifikasi)': 0, 'Gagal (Transaksi)': 0, 'Dilewati (Batas/Stok/Format)': 0 };
    const progressBar = ui.buatProgressBar(isModeCerdas ? 'Eksekusi Rencana' : 'Input Manual');
    progressBar.start(dataToInput.length, 0);

    for (const [index, user] of dataToInput.entries()) {
        progressBar.increment();
        const nik = String(user.noKTP);
        const quantity = user.quantity;
        
        const resultRow = {
            noKTP: nik, nama: 'Akan diverifikasi', customerTypes: 'Akan diverifikasi', status: 'Belum diproses',
            tanggal_transaksi: new Date().toLocaleString('id-ID', {timeZone: 'Asia/Jakarta'}),
            pangkalan: profile.storeName, quantity,
        };

        try {
            if (!nik || !quantity || !/^\d{16}$/.test(nik)) {
                resultRow.status = 'Dilewati - Format NIK/Quantity Salah';
                summary['Dilewati (Batas/Stok/Format)']++;
            } else if (quantity > currentStock) {
                resultRow.status = 'Dilewati - Stok Tidak Cukup';
                summary['Dilewati (Batas/Stok/Format)']++;
            } else {
                const verificationData = await api.getVerificationData(nik, token);
                if (!verificationData) throw new Error("Verifikasi NIK Gagal");

                resultRow.nama = verificationData.name;
                const custType = verificationData.customerTypes?.[0]?.name || 'N/A';
                resultRow.customerTypes = custType;
                
                const monthlyLimit = (custType === 'Usaha Mikro') ? config.aturanBisnis.batasUsahaMikro : config.aturanBisnis.batasPerPangkalan;
                if ((usageMap.get(nik) || 0) >= monthlyLimit) {
                    resultRow.status = `Dilewati - Batas ${monthlyLimit} trx/bulan tercapai`;
                    summary['Dilewati (Batas/Stok/Format)']++;
                } else {
                    const sourceTypeIdValue = (custType === 'Usaha Mikro') ? 2 : 1;
                    const payload = {
                        products: [{ productId: productInfo.productId, quantity }], token: verificationData.token,
                        subsidi: { nik, familyIdEncrypted: verificationData.familyIdEncrypted, category: custType, nama: verificationData.name, channelInject: "tnp2k", sourceTypeId: sourceTypeIdValue },
                    };

                    const trxData = await api.postTransaction(payload, token);
                    if (!trxData.success) throw new Error(trxData.message || "TRANSACTION_INVALID");

                    resultRow.status = `Sukses - ID: ${trxData.data.transactionId}`;
                    summary.Sukses++;
                    currentStock -= quantity;
                    usageMap.set(nik, (usageMap.get(nik) || 0) + 1);

                    if (!pelangganSet.has(nik)) {
                        const newPelanggan = {
                            noKTP: nik, nama: verificationData.name, customerTypes: custType,
                            tanggal_terakhir_transaksi: resultRow.tanggal_transaksi,
                        };
                        dataPelanggan.push(newPelanggan);
                        pelangganSet.add(nik);
                    }
                }
            }
        } catch (error) {
            resultRow.status = `Gagal - ${error.message}`;
            if(error.message === "Verifikasi NIK Gagal") summary['Gagal (Verifikasi)']++;
            else summary['Gagal (Transaksi)']++;
        }
        
        historicalData.push(resultRow);
        excel.tulisLog(config.filePaths.masterLogTransaksi, workbook, sheetName, historicalData);
        
        if (currentStock <= 0) {
             progressBar.update(index + 1);
             progressBar.stop();
             console.log(chalk.red.bold("\n\n🛑 Stok habis, proses dihentikan."));
             break;
        };
        if (index < dataToInput.length - 1) await jeda(config.jeda.transaksi.minDetik, config.jeda.transaksi.maksDetik);
    }
    
    if (currentStock > 0) progressBar.stop();
    
    // [PERBAIKAN] Simpan kembali file master pelanggan yang mungkin sudah diperbarui
    excel.tulisLog(config.filePaths.masterPelanggan, xlsx.utils.book_new(), "Pelanggan", dataPelanggan);
    
    if(!isModeCerdas) {
        console.log(chalk.green.bold("\n\n✅ Proses Selesai. Master Log telah diperbarui."));
        ui.tampilkanTabelRingkasan(summary, "Ringkasan Input Transaksi");
        console.log(`⏱️  Waktu Proses: ${ui.formatWaktuProses(Date.now() - startTime)}`);
    }
    
    let sisaStok = 0;
    Object.keys(summary).forEach(key => {
        if (!key.toLowerCase().includes('sukses')) {
            sisaStok += summary[key];
        }
    });

    return { summary, sisaStok };
}

async function runCekAndUpdateKuotaPelanggan(token) {
    const startTime = Date.now();
    console.log(chalk.bold.yellow("\n--- Memperbarui Kuota di Master Pelanggan ---"));
    
    const dataPelanggan = excel.bacaFile(config.filePaths.masterPelanggan);
    if (!dataPelanggan) {
        console.log(chalk.red.bold(`\n❌ File master pelanggan tidak ditemukan.`));
        return;
    }

    console.log(chalk.blue(`\nMengambil data kuota terbaru untuk ${dataPelanggan.length} pelanggan...`));
    const progressBar = ui.buatProgressBar('Update Kuota');
    progressBar.start(dataPelanggan.length, 0);

    for (const pelanggan of dataPelanggan) {
        progressBar.increment();
        const nik = String(pelanggan.noKTP);
        const verificationData = await api.getVerificationData(nik, token);
        if (verificationData) {
            const quota = await api.getQuota(nik, verificationData, token);
            if (quota) {
                pelanggan.daily = quota.daily;
                pelanggan.monthly = quota.monthly;
                pelanggan.family = quota.family;
                pelanggan.all = quota.all;
                pelanggan.terakhir_dicek = new Date().toISOString();
            }
        }
        await jeda(config.jeda.cekKuota.minDetik, config.jeda.cekKuota.maksDetik);
    }
    progressBar.stop();
    
    excel.tulisLog(config.filePaths.masterPelanggan, xlsx.utils.book_new(), "Pelanggan", dataPelanggan);
    console.log(chalk.green.bold("\n\n✅ Proses Selesai. Data kuota di master pelanggan telah diperbarui."));
    console.log(`⏱️  Waktu Proses: ${ui.formatWaktuProses(Date.now() - startTime)}`);
}

async function runTampilkanLaporan(profile) {
    console.log(chalk.bold.yellow("\n--- Laporan Penjualan ---"));
    const { startDate, endDate } = await ui.promptPilihRentangTanggal();
    endDate.setHours(23, 59, 59, 999); // Set ke akhir hari

    const { data: semuaLog } = excel.bacaSemuaSheetLog(config.filePaths.masterLogTransaksi);
    const sheetName = profile.storeName.replace(/[\\/*?:"\[\]]/g, '').substring(0, 31);
    const logPangkalan = semuaLog[sheetName] || [];
    
    const filteredData = logPangkalan.filter(row => {
        if (!row.status?.startsWith('Sukses')) return false;
        const tglTransaksi = new Date(row.tanggal_transaksi.split(',')[0].split('/').reverse().join('-'));
        return tglTransaksi >= startDate && tglTransaksi <= endDate;
    });

    const aggregated = new Map();
    let totalTabung = 0;
    filteredData.forEach(row => {
        const nik = String(row.noKTP);
        const current = aggregated.get(nik) || { nama: row.nama, kategori: row.customerTypes, total: 0 };
        current.total += row.quantity;
        aggregated.set(nik, current);
        totalTabung += row.quantity;
    });

    const sortedData = [...aggregated.entries()].sort((a, b) => b[1].total - a[1].total);
    
    // [PERBAIKAN] Panggil fungsi dari ui.js untuk menampilkan tabel
    ui.tampilkanTabelLaporan(sortedData);
    
    console.log(chalk.bold(`\nTotal Pelanggan Unik: ${aggregated.size}`));
    console.log(chalk.bold(`Total Tabung Terjual: ${totalTabung}`));
}

// -----------------------------------------------------------------------------
// --- ALUR KERJA UTAMA & NAVIGASI MENU ---
// -----------------------------------------------------------------------------

// [FUNGSI BARU] Letakkan ini di atas fungsi startSystem
async function runValidasiRencana() {
    console.log(chalk.bold.yellow("\n--- [Utilitas] Validasi File Rencana Transaksi ---"));
    const data = excel.bacaFile(config.filePaths.rencanaTransaksi);
    if (!data) return;

    const errors = [];
    const nikSet = new Set();
    data.forEach((row, index) => {
        const baris = index + 2; // Baris di Excel dimulai dari 2 (1 untuk header)
        const nik = String(row.noKTP);

        if (!nik || !/^\d{16}$/.test(nik)) {
            errors.push({ baris, nik: row.noKTP || '', masalah: 'Format NIK salah (harus 16 digit angka)' });
        }
        if (nikSet.has(nik)) {
            errors.push({ baris, nik: nik, masalah: 'NIK duplikat di dalam file' });
        }
        if (!row.quantity || typeof row.quantity !== 'number' || row.quantity <= 0) {
            errors.push({ baris, nik: nik, masalah: 'Kuantitas tidak valid (harus angka > 0)' });
        }
        nikSet.add(nik);
    });

    if (errors.length === 0) {
        console.log(chalk.green.bold("\n✅ Validasi berhasil! Tidak ditemukan error pada file rencana."));
    } else {
        // [PERBAIKAN] Panggil fungsi dari ui.js untuk menampilkan tabel
        ui.tampilkanTabelValidasi(errors);
    }
}

async function runManajemenTemplate() {
    const startTime = Date.now();
    console.log(chalk.bold.yellow("\n--- [Utilitas] Membuat File Template Input ---"));

    // Template untuk Mode Cerdas
    const pathRencana = config.filePaths.rencanaTransaksi;
    if (!fs.existsSync(pathRencana)) {
        const templateData = [{ noKTP: '1234567890123456', quantity: 1 }];
        excel.tulisLog(pathRencana, xlsx.utils.book_new(), "Rencana", templateData);
        console.log(chalk.green(`   ✅ Template "${pathRencana}" berhasil dibuat.`));
    } else {
        console.log(chalk.gray(`   ℹ️  File "${pathRencana}" sudah ada.`));
    }

    // Template untuk Input Manual
    const pathManual = config.filePaths.inputFileTransaksi;
    if (!fs.existsSync(pathManual)) {
        const templateData = [{ noKTP: '1234567890123456', quantity: 1, nama: '(opsional)' }];
        excel.tulisLog(pathManual, xlsx.utils.book_new(), "Sheet1", templateData);
        console.log(chalk.green(`   ✅ Template "${pathManual}" berhasil dibuat.`));
    } else {
        console.log(chalk.gray(`   ℹ️  File "${pathManual}" sudah ada.`));
    }
    
    console.log(`\n⏱️  Waktu Proses: ${ui.formatWaktuProses(Date.now() - startTime)}`);
}

async function startSystem() {
    await ui.initializeDependencies();
    chalk = (await import('chalk')).default;
    inquirer = (await import('inquirer')).default;
    ui.tampilkanHeader();
    let token = await ui.dapatkanToken();
    if (!token) return;

    let profile;
    while(true) {
        console.log(chalk.blue("\nMemverifikasi token & mengambil profil..."));
        profile = await api.getProfileInfo(token);
        if (profile) { console.log(chalk.green("Token valid.")); break; }
        
        console.log(chalk.red.bold("Token tidak valid atau gagal."));
        if(fs.existsSync(config.filePaths.tokenCache)) fs.unlinkSync(config.filePaths.tokenCache);
        const { retry } = await inquirer.prompt([{ type: 'confirm', name: 'retry', message: 'Coba lagi?', default: true }]);
        if (retry) { token = await ui.dapatkanToken(); } else { return; }
    }
    
    while (true) {
        const productInfo = await api.getProducts(token);
        ui.tampilkanHeader();
        ui.tampilkanDashboard(profile, productInfo);
        const { menuChoice } = await ui.tampilkanMenuUtama();

        if (['2', '3', '4', '5'].includes(menuChoice.value)) {
            console.log(chalk.blue("\nMembuat backup master log sebelum melanjutkan..."));
            await backupMasterLog();
        }

        // [PERUBAHAN] Switch case disesuaikan dengan menu baru
        switch (menuChoice) {
            case '1': await buatRencanaTransaksi(token, profile); break;
            case '2': await runValidasiRencana(); break;
            case '3': await eksekusiRencanaTransaksi(token, profile); break;
            case '4': await runTransaksiLangsung(token, profile); break;
            case '5': await runTransactionInputProcess(token, profile); break;
            case '6': await runTambahPelangganBaru(token); break;
            case '7': await runBuatMasterPelanggan(); break;
            case '8': await runCekAndUpdateKuotaPelanggan(token); break;
            case '9': await runTampilkanLaporan(profile); break;
            case '10': await runManajemenTemplate(); break;
            case '11': await startSystem(); return;
            case '12': 
                console.log(chalk.yellow("\nTerima kasih! Sampai jumpa."));
                process.exit(0);
        }

        const { returnToMenu } = await inquirer.prompt([{ type: 'confirm', name: 'returnToMenu', message: 'Kembali ke menu utama?', default: true, }]);
        if (!returnToMenu) {
            console.log(chalk.yellow("\nTerima kasih! Sampai jumpa."));
            process.exit(0);
        }
    }
}

startSystem();

