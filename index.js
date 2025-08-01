// Nama file: index.js

// -----------------------------------------------------------------------------
// --- Impor Modul & Konfigurasi ---
// -----------------------------------------------------------------------------
const api = require('./api');
const excel = require('./excel');
const ui = require('./ui');
const config = require('./config.json');
const Table = require('cli-table3');

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

async function runTambahPelangganSatuan(token) {
    const startTime = Date.now();
    console.log(chalk.bold.yellow("\n--- [Manajemen] Menambahkan Pelanggan Satuan ---"));

    try {
        const { nik } = await ui.promptTambahPelangganSatuan();

        const dataPelanggan = excel.bacaFile(config.filePaths.masterPelanggan) || [];
        const pelangganSet = new Set(dataPelanggan.map(p => String(p.noKTP)));

        // Pengecekan Duplikasi
        if (pelangganSet.has(nik)) {
            throw new Error(`Pelanggan dengan NIK ${nik} sudah ada di dalam master.`);
        }

        console.log(chalk.blue(`\nMemverifikasi NIK ${nik} ke server...`));
        const verificationData = await api.getVerificationData(nik, token);
        if (!verificationData) {
            throw new Error("Verifikasi NIK Gagal. Pastikan NIK terdaftar di sistem subsidi.");
        }

        const quota = await api.getQuota(nik, verificationData, token);
        const custType = verificationData.customerTypes?.[0]?.name || 'N/A';

        // Membuat objek pelanggan baru dengan struktur yang sama
        const newPelanggan = {
            noKTP: nik,
            nama: verificationData.name,
            customerTypes: custType,
            tanggal_terakhir_transaksi: 'Belum Pernah Transaksi',
            daily: quota?.daily ?? 0,
            monthly: quota?.monthly ?? 0,
            family: quota?.family ?? 'N/A',
            all: quota?.all ?? 0,
            terakhir_dicek: new Date().toISOString()
        };

        dataPelanggan.push(newPelanggan);
        excel.tulisLog(config.filePaths.masterPelanggan, xlsx.utils.book_new(), "Pelanggan", dataPelanggan);
        
        console.log(chalk.green.bold(`\n✅ Pelanggan "${verificationData.name}" berhasil ditambahkan ke master.`));

    } catch (error) {
        console.log(chalk.red.bold(`\n❌ Gagal: ${error.message}`));
    } finally {
        console.log(`⏱️  Waktu Proses: ${ui.formatWaktuProses(Date.now() - startTime)}`);
    }
}

// Ganti dengan versi final ini
// Ganti fungsi runSinkronisasiLaporan Anda dengan VERSI DEBUG ini
async function runSinkronisasiLaporan(token, profile) {
    const startTime = Date.now();
    console.log(chalk.bold.yellow("\n--- [Laporan] Sinkronisasi Data Transaksi (VERSI DEBUG) ---"));

    try {
        const { startDate, endDate } = await ui.promptPilihRentangTanggal();
        const tglMulai = startDate.toISOString().split('T')[0];
        const tglSelesai = endDate.toISOString().split('T')[0];
        
        console.log(chalk.blue("\n1. Membaca data Master Pelanggan lokal..."));
        const dataPelanggan = excel.bacaFile(config.filePaths.masterPelanggan) || [];
        
        console.log(chalk.magenta("\nDEBUG: Memanggil api.getTransactionsReport..."));
        const serverCustomers = await api.getTransactionsReport(token, tglMulai, tglSelesai);
        console.log(chalk.magenta(`DEBUG: Hasil dari getTransactionsReport diterima. Tipe: ${typeof serverCustomers}, Apakah Array? ${Array.isArray(serverCustomers)}`));

        if (!Array.isArray(serverCustomers)) {
            throw new Error("GAGAL: serverCustomers bukan sebuah array! Kemungkinan besar ada kesalahan di fungsi getTransactionsReport di api.js.");
        }

        console.log(chalk.blue(`\n2. Ditemukan ${serverCustomers.length} rekap pelanggan di server.`));

        console.log(chalk.blue("\n3. Membaca log transaksi lokal..."));
        const sheetName = profile.storeName.replace(/[\\/*?:"\[\]]/g, '').substring(0, 31);
        const { data: localData, workbook } = excel.bacaLog(config.filePaths.masterLogTransaksi, sheetName);
        const localTransactionIds = new Set(localData.map(row => (row.status || '').match(/ID: ([\w-]+)/)?.[1]).filter(Boolean));

        let transactionsAdded = 0;
        const progressBar = ui.buatProgressBar('Sinkronisasi');
        progressBar.start(serverCustomers.length, 0);

        for (const [index, customer] of serverCustomers.entries()) {
            console.log(chalk.gray(`\nMemproses pelanggan ${index + 1}/${serverCustomers.length}: ${customer.name}...`));

            console.log(chalk.magenta(`DEBUG: Memanggil api.getTransactionsByCustomer untuk ${customer.name}...`));
            const serverTransactions = await api.getTransactionsByCustomer(token, tglMulai, tglSelesai, customer.customerReportId);
            console.log(chalk.magenta(`DEBUG: Hasil dari getTransactionsByCustomer diterima. Tipe: ${typeof serverTransactions}, Apakah Array? ${Array.isArray(serverTransactions)}`));

            if (!Array.isArray(serverTransactions)) {
                 console.log(chalk.red.bold(`\nERROR: serverTransactions untuk pelanggan ${customer.name} bukan array! Melanjutkan ke pelanggan berikutnya.`));
                 progressBar.increment();
                 continue;
            }
            
            for (const tx of serverTransactions) {
                if (!localTransactionIds.has(tx.transactionId)) {
                    // ... (sisa logika sama seperti sebelumnya)
                    const detail = await api.getTransactionDetail(token, tx.transactionId);
                    const maskedNik = tx.nationalityId || detail.subsidi.nik;
                    const customerName = detail.subsidi.nama;
                    const customerCategory = detail.subsidi.category;
                    const cleanName = (name) => name.trim().replace(/\s+/g, ' ').toLowerCase();
                    const serverNameClean = cleanName(customerName);
                    let matchedCustomer = null;
                    matchedCustomer = dataPelanggan.find(p => cleanName(p.nama) === serverNameClean && String(p.noKTP).slice(0, 3) === maskedNik.slice(0, 3) && String(p.noKTP).slice(-3) === maskedNik.slice(-3) );
                    if (!matchedCustomer) {
                        const nikPatternMatches = dataPelanggan.filter(p => String(p.noKTP).slice(0, 3) === maskedNik.slice(0, 3) && String(p.noKTP).slice(-3) === maskedNik.slice(-3) );
                        if (nikPatternMatches.length === 1) { matchedCustomer = nikPatternMatches[0]; }
                    }
                    let fullNik = maskedNik;
                    if (matchedCustomer) { fullNik = matchedCustomer.noKTP; }
                    if (fullNik !== maskedNik && !fullNik.includes('x')) {
                        console.log(chalk.cyan(`\n   > Menambahkan transaksi hilang: ID ${tx.transactionId} untuk ${customerName} (NIK: ${fullNik})`));
                    } else {
                        console.log(chalk.yellow(`\n   > Menambahkan transaksi hilang: ID ${tx.transactionId} untuk ${customerName} (NIK LENGKAP TIDAK DITEMUKAN DI MASTER)`));
                    }
                    const newLogRow = { noKTP: fullNik, nama: customerName, customerTypes: customerCategory, status: `Sukses - ID: ${detail.transactionId}`, tanggal_transaksi: detail.subHeader.date, pangkalan: detail.receipt.storeName, quantity: detail.products[0].rawValue.quantity };
                    localData.push(newLogRow);
                    transactionsAdded++;
                }
            }
            progressBar.increment();
            await jeda(0, 1);
        }
        progressBar.stop();

        if (transactionsAdded > 0) {
            console.log(chalk.green.bold(`\n\n✅ Sinkronisasi selesai. ${transactionsAdded} transaksi baru berhasil ditambahkan.`));
            excel.tulisLog(config.filePaths.masterLogTransaksi, workbook, localData);
        } else {
            console.log(chalk.green.bold("\n\n✅ Sinkronisasi selesai. Log lokal Anda sudah sesuai dengan data server."));
        }

    } catch (error) {
        console.log(chalk.red.bold(`\n❌ Terjadi kesalahan saat sinkronisasi: ${error.message}`));
    } finally {
        console.log(`⏱️  Waktu Proses: ${ui.formatWaktuProses(Date.now() - startTime)}`);
    }
}

async function runSearchLocalMaster() {
    console.log(chalk.bold.yellow("\n--- [Diagnosis] Cari Pelanggan di Master Lokal ---"));
    try {
        const dataPelanggan = excel.bacaFile(config.filePaths.masterPelanggan) || [];
        if (dataPelanggan.length === 0) {
            console.log(chalk.yellow("File Master Pelanggan kosong atau tidak ditemukan."));
            return;
        }

        const { nama } = await ui.promptSearchByName();
        const searchInput = nama.trim().toLowerCase();

        const results = dataPelanggan.filter(p => 
            p.nama.trim().toLowerCase().includes(searchInput)
        );

        if (results.length > 0) {
            console.log(chalk.green(`\n✅ Ditemukan ${results.length} hasil untuk pencarian "${nama}":`));
            const table = new Table({ head: [chalk.cyan('Nama Lengkap di Master'), chalk.cyan('NIK Lengkap di Master')] });
            results.forEach(p => table.push([p.nama, p.noKTP]));
            console.log(table.toString());
        } else {
            console.log(chalk.red(`\n❌ Tidak ada pelanggan yang cocok dengan pencarian "${nama}" di dalam file master Anda.`));
        }
    } catch (error) {
        console.log(chalk.red.bold(`\n❌ Terjadi kesalahan saat mencari: ${error.message}`));
    }
}

async function runDiagnosisData(token) {
    const startTime = Date.now();
    console.log(chalk.bold.yellow("\n--- [Diagnosis] Cek & Perbaiki Data Pelanggan ---"));

    try {
        const { startDate, endDate } = await ui.promptPilihRentangTanggal();
        const tglMulai = startDate.toISOString().split('T')[0];
        const tglSelesai = endDate.toISOString().split('T')[0];
        
        console.log(chalk.blue("\n1. Membaca data Master Pelanggan lokal..."));
        const dataPelanggan = excel.bacaFile(config.filePaths.masterPelanggan) || [];
        
        console.log(chalk.blue(`\n2. Mengambil laporan dari server untuk perbandingan...`));
        const serverCustomers = await api.getTransactionsReport(token, tglMulai, tglSelesai);
        if (serverCustomers.length === 0) {
            console.log(chalk.yellow("Tidak ada data di server untuk dibandingkan pada periode ini."));
            return;
        }

        const discrepancies = [];
        const cleanName = (name) => name.trim().replace(/\s+/g, ' ').toLowerCase();

        for (const customer of serverCustomers) {
            const serverName = customer.name;
            const maskedNik = customer.nationalityId;
            const serverNameClean = cleanName(serverName);

            const perfectMatch = dataPelanggan.find(p => 
                cleanName(p.nama) === serverNameClean &&
                String(p.noKTP).slice(0, 3) === maskedNik.slice(0, 3) &&
                String(p.noKTP).slice(-3) === maskedNik.slice(-3)
            );

            if (!perfectMatch) {
                const nikPatternMatches = dataPelanggan.filter(p =>
                    String(p.noKTP).slice(0, 3) === maskedNik.slice(0, 3) &&
                    String(p.noKTP).slice(-3) === maskedNik.slice(-3)
                );

                let suggestion = 'Tidak ada kandidat NIK yang cocok.';
                if (nikPatternMatches.length > 0) {
                    suggestion = nikPatternMatches.map(p => `${p.nama} | ${p.noKTP}`).join(', ');
                }

                discrepancies.push({
                    serverName: serverName,
                    maskedNik: maskedNik,
                    suggestion: suggestion
                });
            }
        }

        if (discrepancies.length > 0) {
            console.log(chalk.red.bold(`\n\n❌ Ditemukan ${discrepancies.length} potensi data yang tidak cocok!`));
            const table = new Table({ head: [chalk.cyan('Nama di Server'), chalk.cyan('Pola NIK Server'), chalk.cyan('Saran Perbaikan di Master Lokal Anda')] });
            discrepancies.forEach(d => table.push([d.serverName, d.maskedNik, d.suggestion]));
            console.log(table.toString());
            console.log(chalk.yellow.bold("\nINSTRUKSI:\n1. Buka file MASTER_PELANGGAN.xlsx Anda.\n2. Cari pelanggan berdasarkan NIK pada kolom 'Saran Perbaikan'.\n3. Ubah nama pelanggan di master Anda agar SAMA PERSIS dengan 'Nama di Server'.\n4. Setelah semua diperbaiki, jalankan kembali 'Menu 10: Sinkronisasi'."));
        } else {
            console.log(chalk.green.bold("\n\n✅ Selamat! Semua data pelanggan yang bertransaksi sudah cocok dengan master lokal Anda."));
        }

    } catch (error) {
        console.log(chalk.red.bold(`\n❌ Terjadi kesalahan saat diagnosis: ${error.message}`));
    } finally {
        console.log(`⏱️  Waktu Proses: ${ui.formatWaktuProses(Date.now() - startTime)}`);
    }
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
            const quota = await api.getQuota(nik, verificationData, token);
            
            const custType = verificationData.customerTypes?.[0]?.name || 'N/A';
            dataPelanggan.push({
                noKTP: nik,
                nama: verificationData.name,
                customerTypes: custType,
                tanggal_terakhir_transaksi: 'Belum Pernah Transaksi',
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
// --- FUNGSI-FUNGSI MODE CERDAS & INTI ---
// -----------------------------------------------------------------------------

async function runTransaksiLangsung(token, profile) {
    const startTime = Date.now();
    console.log(chalk.bold.yellow("\n--- [Transaksi Langsung] Input On-The-Spot ---"));

    try {
        const pathMasterPelanggan = config.filePaths.masterPelanggan;
        let dataPelanggan = excel.bacaFile(pathMasterPelanggan) || [];
        const pelangganSet = new Set(dataPelanggan.map(p => String(p.noKTP)));
        
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

        const tanggalTransaksi = new Date().toLocaleString('id-ID', {timeZone: 'Asia/Jakarta'});
        const resultRow = {
            noKTP: nik, nama: verificationData.name, customerTypes: custType,
            status: `Sukses - ID: ${trxData.data.transactionId}`,
            tanggal_transaksi: tanggalTransaksi,
            pangkalan: profile.storeName, quantity,
        };
        
        historicalData.push(resultRow);
        excel.tulisLog(config.filePaths.masterLogTransaksi, workbook, sheetName, historicalData);
        
        if (!pelangganSet.has(nik)) {
            const quota = await api.getQuota(nik, verificationData, token);

            const newPelanggan = {
                noKTP: nik,
                nama: verificationData.name,
                customerTypes: custType,
                tanggal_terakhir_transaksi: tanggalTransaksi,
                daily: quota?.daily ?? 0,
                monthly: quota?.monthly ?? 0,
                family: quota?.family ?? 'N/A',
                all: quota?.all ?? 0,
                terakhir_dicek: new Date().toISOString()
            };
            dataPelanggan.push(newPelanggan);
            console.log(chalk.blue(`   > Pelanggan baru "${verificationData.name}" ditambahkan ke master.`));
        }
        
        excel.tulisLog(config.filePaths.masterPelanggan, xlsx.utils.book_new(), "Pelanggan", dataPelanggan);
        
        console.log(chalk.green.bold(`\n✅ Transaksi untuk ${verificationData.name} berhasil!`));
        console.log(`   Stok tersisa: ${productInfo.stockAvailable - quantity}`);
        
    } catch (error) {
        console.log(chalk.red.bold(`\n❌ Gagal: ${error.message}`));
    }
    
    console.log(`\n⏱️  Waktu Proses: ${ui.formatWaktuProses(Date.now() - startTime)}`);
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
        
        let lolosJarakHari = false;
        const tglTerakhir = pelanggan.tanggal_terakhir_transaksi;

        if (!tglTerakhir || tglTerakhir === 'Belum Pernah Transaksi') {
            lolosJarakHari = true;
        } else {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const lastTxDate = new Date(tglTerakhir.split(',')[0].split('/').reverse().join('-'));
            lastTxDate.setHours(0, 0, 0, 0);

            const selisihMillis = today.getTime() - lastTxDate.getTime();
            const selisihHari = Math.floor(selisihMillis / (1000 * 60 * 60 * 24));

            if (selisihHari >= config.aturanBisnis.jarakHariMinimumTransaksi) {
                lolosJarakHari = true;
            }
        }
        
        const lolosKuotaCache = !(typeof pelanggan.monthly === 'number' && pelanggan.monthly <= 0);
        return usageDiPangkalanIni < limitPangkalan && lolosKuotaCache && lolosJarakHari;
    });
    console.log(chalk.gray(`   > Ditemukan ${kandidatPelanggan.length} kandidat awal.`));
    
    kandidatPelanggan.sort((a, b) => {
        const tglA = a.tanggal_terakhir_transaksi === 'Belum Pernah Transaksi' ? 0 : new Date(a.tanggal_terakhir_transaksi.split(',')[0].split('/').reverse().join('-')).getTime();
        const tglB = b.tanggal_terakhir_transaksi === 'Belum Pernah Transaksi' ? 0 : new Date(b.tanggal_terakhir_transaksi.split(',')[0].split('/').reverse().join('-')).getTime();
        return tglA - tglB;
    });
    
    const limitVerifikasi = Math.ceil(totalStock * config.aturanBisnis.faktor_buffer_kandidat);
    const kandidatTeratas = kandidatPelanggan.slice(0, limitVerifikasi);
    
    console.log(chalk.blue(`\n3. Memprioritaskan dan memilih ${kandidatTeratas.length} kandidat terbaik untuk diverifikasi API...`));
    const eligibleCustomers = [];
    const progressBar = ui.buatProgressBar('Update Cerdas');
    progressBar.start(kandidatTeratas.length, 0);

    for (const [index, pelanggan] of kandidatTeratas.entries()) {
        progressBar.increment();
        const nik = String(pelanggan.noKTP);

        let isDataFresh = false;
        if (pelanggan.terakhir_dicek) {
            const lastCheckedDate = new Date(pelanggan.terakhir_dicek);
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
            if (index < kandidatTeratas.length - 1) {
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
        quantity: 1,
        sisa_kuota_harian: p.daily,
        sisa_kuota_bulanan: p.monthly,
        sisa_kuota_keluarga: p.family
    }));

    console.log(chalk.green(`\n5. Berhasil menemukan ${eligibleCustomers.length} pelanggan, ${pelangganTerpilih.length} dipilih untuk rencana.`));
    excel.tulisLog(config.filePaths.rencanaTransaksi, xlsx.utils.book_new(), "Rencana", pelangganTerpilih);
    
    console.log(chalk.bold.green(`\n✅ File "${config.filePaths.rencanaTransaksi}" berhasil dibuat.`));
    console.log(`   Silakan periksa dan sesuaikan file tersebut sebelum dieksekusi.`);
    console.log(`⏱️  Waktu Proses: ${ui.formatWaktuProses(Date.now() - startTime)}`);
}

async function eksekusiRencanaTransaksi(token, profile) {
    const startTime = Date.now();
    console.log(chalk.bold.yellow("\n--- [Cerdas] Eksekusi Rencana Transaksi dengan Auto-Replace ---"));

    const dataToInput = excel.bacaFile(config.filePaths.rencanaTransaksi);
    if (!dataToInput || dataToInput.length === 0) {
        console.log(chalk.red(`File rencana transaksi tidak ditemukan atau kosong.`));
        return;
    }

    // --- PERSIAPAN PENGGANTI ---
    console.log(chalk.blue("1. Mempersiapkan daftar pelanggan pengganti..."));
    const dataPelanggan = excel.bacaFile(config.filePaths.masterPelanggan) || [];
    const niksDalamRencana = new Set(dataToInput.map(u => String(u.noKTP)));
    
    let kandidatPengganti = dataPelanggan
        .filter(p => !niksDalamRencana.has(String(p.noKTP)) && p.monthly > 0)
        .sort((a, b) => {
            const tglA = a.tanggal_terakhir_transaksi === 'Belum Pernah Transaksi' ? 0 : new Date(a.tanggal_terakhir_transaksi.split(',')[0].split('/').reverse().join('-')).getTime();
            const tglB = b.tanggal_terakhir_transaksi === 'Belum Pernah Transaksi' ? 0 : new Date(b.tanggal_terakhir_transaksi.split(',')[0].split('/').reverse().join('-')).getTime();
            return tglA - tglB;
        });
    
    console.log(chalk.gray(`   > Ditemukan ${kandidatPengganti.length} kandidat pengganti.`));


    // --- EKSEKUSI UTAMA ---
    console.log(chalk.blue("\n2. Memulai eksekusi transaksi..."));
    const { summary } = await runTransactionInputProcess(token, profile, dataToInput, kandidatPengganti);
    
    console.log(chalk.bold.green("\n\n🏁 Eksekusi Rencana Selesai."));
    ui.tampilkanTabelRingkasan(summary, "Ringkasan Akhir Eksekusi");
    console.log(`⏱️  Total Waktu Eksekusi: ${ui.formatWaktuProses(Date.now() - startTime)}`);
}

/**
 * --- [FUNGSI INTI YANG DIPERBAIKI] ---
 * Fungsi ini sekarang memiliki logika untuk menangani pelanggan pengganti secara otomatis.
 */
async function runTransactionInputProcess(token, profile, dataDariRencana = null, kandidatPengganti = []) {
    const startTime = Date.now();
    const isModeCerdas = !!dataDariRencana;
    
    if (!isModeCerdas) {
        console.log(chalk.bold.yellow(`\n--- [Utilitas] Input Transaksi Manual ---`));
    }

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
    const summary = { 'Sukses': 0, 'Gagal (Verifikasi)': 0, 'Gagal (Transaksi)': 0, 'Dilewati (Batas/Stok/Format)': 0, 'Sukses (Pengganti)': 0, 'Gagal (Pengganti)': 0 };
    const progressBar = ui.buatProgressBar(isModeCerdas ? 'Eksekusi Rencana' : 'Input Manual');
    progressBar.start(dataToInput.length, 0);

    const processSingleTransaction = async (user, isReplacement = false) => {
        const nik = String(user.noKTP);
        const quantity = user.quantity || 1;
        
        const resultRow = {
            noKTP: nik, nama: 'Akan diverifikasi', customerTypes: 'Akan diverifikasi', status: 'Belum diproses',
            tanggal_transaksi: new Date().toLocaleString('id-ID', {timeZone: 'Asia/Jakarta'}),
            pangkalan: profile.storeName, quantity,
        };

        try {
            if (!nik || !quantity || !/^\d{16}$/.test(nik)) {
                throw new Error('Format NIK/Quantity Salah');
            }
            if (quantity > currentStock) {
                throw new Error('Stok Tidak Cukup');
            }

            // 1. Dapatkan semua data dari server
            const verificationData = await api.getVerificationData(nik, token);
            if (!verificationData) throw new Error("Verifikasi NIK Gagal");

            resultRow.nama = verificationData.name;

            // 2. Ekstrak NAMA Tipe Pelanggan & NOMOR sourceTypeId-nya dari data verifikasi
            const customerTypeInfo = verificationData.customerTypes?.[0];
            const custType = customerTypeInfo?.name || 'N/A'; // Ini akan berisi "Rumah Tangga" atau "Usaha Mikro"
            const sourceTypeIdValue = customerTypeInfo?.sourceTypeId; // Ini akan berisi nomor dari server, misal: 99

            resultRow.customerTypes = custType;
            
            // 3. Gunakan NAMA Tipe Pelanggan untuk aturan lokal (misal: batas bulanan). Bagian ini sudah benar.
            const monthlyLimit = (custType === 'Usaha Mikro') ? config.aturanBisnis.batasUsahaMikro : config.aturanBisnis.batasPerPangkalan;
            if ((usageMap.get(nik) || 0) >= monthlyLimit) {
                throw new Error(`Batas ${monthlyLimit} trx/bulan tercapai`);
            }
            
            // 4. Bangun payload dengan 'category' (NAMA) dan 'sourceTypeId' (NOMOR) yang didapat dari server
            const payload = {
                products: [{ productId: productInfo.productId, quantity }], 
                token: verificationData.token,
                subsidi: { 
                    nik, 
                    familyIdEncrypted: verificationData.familyIdEncrypted, 
                    category: custType, // Menggunakan NAMA ("Rumah Tangga" / "Usaha Mikro")
                    nama: verificationData.name, 
                    channelInject: "tnp2k",
                    sourceTypeId: sourceTypeIdValue // Menggunakan NOMOR dari server (cth: 99)
                },
            };
            
            // Pastikan sourceTypeId tidak kosong sebelum mengirim
            if (!sourceTypeIdValue) {
                throw new Error(`sourceTypeId tidak ditemukan untuk NIK ${nik}`);
            }

            const trxData = await api.postTransaction(payload, token);
            if (!trxData.success) throw new Error(trxData.message || "TRANSACTION_INVALID");

            resultRow.status = `Sukses - ID: ${trxData.data.transactionId}`;
            if (isReplacement) summary['Sukses (Pengganti)']++; else summary.Sukses++;
            
            currentStock -= quantity;
            usageMap.set(nik, (usageMap.get(nik) || 0) + 1);
            
            const pelangganDiMaster = dataPelanggan.find(p => String(p.noKTP) === nik);
            if (pelangganDiMaster) {
                pelangganDiMaster.tanggal_terakhir_transaksi = resultRow.tanggal_transaksi;
            } else if (!pelangganSet.has(nik)) {
                const quota = await api.getQuota(nik, verificationData, token);
                dataPelanggan.push({
                    noKTP: nik, nama: verificationData.name, customerTypes: custType,
                    tanggal_terakhir_transaksi: resultRow.tanggal_transaksi,
                    daily: quota?.daily ?? 0, monthly: quota?.monthly ?? 0,
                    family: quota?.family ?? 'N/A', all: quota?.all ?? 0,
                    terakhir_dicek: new Date().toISOString()
                });
                pelangganSet.add(nik);
            }
            historicalData.push(resultRow);
            return true; // Sukses

        } catch (error) {
            resultRow.status = `Gagal - ${error.message}`;
            if (isReplacement) {
                summary['Gagal (Pengganti)']++;
            } else {
                if(error.message === "Verifikasi NIK Gagal") summary['Gagal (Verifikasi)']++;
                else if (error.message.includes('Batas') || error.message.includes('Stok') || error.message.includes('Format')) summary['Dilewati (Batas/Stok/Format)']++;
                else summary['Gagal (Transaksi)']++;
            }
            historicalData.push(resultRow);
            return false; // Gagal
        }
    };

    for (const [index, user] of dataToInput.entries()) {
        progressBar.increment();
        
        const success = await processSingleTransaction(user, false);

        if (!success && isModeCerdas) {
            console.log(chalk.yellow(`\n   ↪️ Transaksi untuk ${user.noKTP} gagal, mencari pengganti...`));
            if (kandidatPengganti.length > 0) {
                const pengganti = kandidatPengganti.shift(); // Ambil & hapus kandidat pertama
                console.log(chalk.cyan(`   > Mencoba dengan pengganti: ${pengganti.noKTP} (${pengganti.nama})`));
                await processSingleTransaction(pengganti, true);
            } else {
                console.log(chalk.red('   > Tidak ada kandidat pengganti yang tersisa.'));
            }
        }
        
        if (currentStock <= 0) {
             progressBar.stop();
             console.log(chalk.red.bold("\n\n🛑 Stok habis, proses dihentikan."));
             break;
        };

        if (index < dataToInput.length - 1) {
            await jeda(config.jeda.transaksi.minDetik, config.jeda.transaksi.maksDetik);
        }
    }
    
    progressBar.stop();
    
    excel.tulisLog(config.filePaths.masterLogTransaksi, workbook, sheetName, historicalData);
    excel.tulisLog(config.filePaths.masterPelanggan, xlsx.utils.book_new(), "Pelanggan", dataPelanggan);
    
    if(!isModeCerdas) {
        console.log(chalk.green.bold("\n\n✅ Proses Selesai. Master Log & Pelanggan telah diperbarui."));
        ui.tampilkanTabelRingkasan(summary, "Ringkasan Input Transaksi");
        console.log(`⏱️  Waktu Proses: ${ui.formatWaktuProses(Date.now() - startTime)}`);
    }

    return { summary };
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

// -----------------------------------------------------------------------------
// --- ALUR KERJA UTAMA & NAVIGASI MENU ---
// -----------------------------------------------------------------------------

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
        ui.tampilkanTabelValidasi(errors);
    }
}

async function runManajemenTemplate() {
    const startTime = Date.now();
    console.log(chalk.bold.yellow("\n--- [Utilitas] Membuat File Template Input ---"));

    const ensureDirExists = (filePath) => {
        const dir = filePath.substring(0, filePath.lastIndexOf('/'));
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    const pathRencana = config.filePaths.rencanaTransaksi;
    ensureDirExists(pathRencana);
    if (!fs.existsSync(pathRencana)) {
        const templateData = [{
            noKTP: '1234567890123456',
            nama: 'NAMA PELANGGAN (opsional)',
            customerTypes: 'Rumah Tangga (opsional)',
            quantity: 1,
        }];
        excel.tulisLog(pathRencana, xlsx.utils.book_new(), "Rencana", templateData);
        console.log(chalk.green(`   ✅ Template "${pathRencana}" berhasil dibuat.`));
    } else {
        console.log(chalk.gray(`   ℹ️  File "${pathRencana}" sudah ada.`));
    }

    const pathManual = config.filePaths.inputFileTransaksi;
    ensureDirExists(pathManual);
    if (!fs.existsSync(pathManual)) {
        const templateData = [{ noKTP: '1234567890123456', quantity: 1 }];
        excel.tulisLog(pathManual, xlsx.utils.book_new(), "Sheet1", templateData);
        console.log(chalk.green(`   ✅ Template "${pathManual}" berhasil dibuat.`));
    } else {
        console.log(chalk.gray(`   ℹ️  File "${pathManual}" sudah ada.`));
    }

    const pathPelangganBaru = config.filePaths.inputFilePelangganBaru;
    ensureDirExists(pathPelangganBaru);
     if (!fs.existsSync(pathPelangganBaru)) {
        const templateData = [{ noKTP: '1234567890123456' }];
        excel.tulisLog(pathPelangganBaru, xlsx.utils.book_new(), "Sheet1", templateData);
        console.log(chalk.green(`   ✅ Template "${pathPelangganBaru}" berhasil dibuat.`));
    } else {
        console.log(chalk.gray(`   ℹ️  File "${pathPelangganBaru}" sudah ada.`));
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

        // Backup sebelum operasi tulis yang signifikan
        if (['3', '4', '5'].includes(menuChoice)) {
            console.log(chalk.blue("\nMembuat backup master log sebelum melanjutkan..."));
            await backupMasterLog();
        }

         switch (menuChoice) {
            case '1': await buatRencanaTransaksi(token, profile); break;
            case '2': await runValidasiRencana(); break;
            case '3': await eksekusiRencanaTransaksi(token, profile); break;
            case '4': await runTransaksiLangsung(token, profile); break;
            case '5': await runTransactionInputProcess(token, profile); break;
            case '6': await runTambahPelangganBaru(token); break;
            case '7': await runTambahPelangganSatuan(token); break;
            case '8': await runBuatMasterPelanggan(); break;
            case '9': await runCekAndUpdateKuotaPelanggan(token); break;
            case '10': await runSinkronisasiLaporan(token, profile); break;
            case '11': await runManajemenTemplate(); break;
            case '12': await runDiagnosisData(token); break;
            case '13': await runSearchLocalMaster(); break; // <--- Panggil fungsi baru
            case '14': await startSystem(); return;
            case '15': 
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