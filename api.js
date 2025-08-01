const axios = require("axios");
const config = require("./config.json");
const chalk = require("chalk");

const BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const apiInstance = axios.create({
    baseURL: config.apiBaseUrl,
    headers: {
        'User-Agent': BROWSER_USER_AGENT, 'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://subsiditepatlpg.mypertamina.id', 'Referer': 'https://subsiditepatlpg.mypertamina.id/',
    }
});

apiInstance.interceptors.response.use((response) => response, async (error) => {
    const originalRequest = error.config;
    const isRetryable = (error.response && error.response.status >= 500) || !error.response;
    
    if (isRetryable && (originalRequest._retryCount || 0) < config.retry.jumlah) {
        originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;
        const delay = config.retry.jedaDetik * originalRequest._retryCount * 1000;
        console.log(chalk.yellow(`\n⚠️  Server/Jaringan error. Mencoba lagi dalam ${delay / 1000} detik... (Percobaan ${originalRequest._retryCount})`));
        await new Promise(resolve => setTimeout(resolve, delay));
        return apiInstance(originalRequest);
    }
    return Promise.reject(error);
});

const getHeaders = (token) => ({ Authorization: `Bearer ${token}` });

const getProfileInfo = async (token) => {
    try {
        const { data } = await apiInstance.get("/general/v1/users/profile", { headers: getHeaders(token) });
        return data?.success ? data.data : null;
    } catch (error) { return null; }
};

const getProducts = async (token) => {
    const { data } = await apiInstance.get("/general/v2/products", { headers: getHeaders(token) });
    if (!data?.success || !data.data) throw new Error("Gagal memuat info produk/stok.");
    return data.data;
};

const getVerificationData = async (nik, token) => {
    try {
        const { data } = await apiInstance.get("/customers/v2/verify-nik", {
            params: { nationalityId: nik }, headers: getHeaders(token),
        });
        return data?.success ? data.data : null;
    } catch (error) { return null; }
};

const getQuota = async (nik, verificationData, token) => {
    try {
        const { familyIdEncrypted, customerTypes } = verificationData;
        const customerType = customerTypes?.[0]?.name;

        // [PERBAIKAN] Pengecekan familyIdEncrypted dihapus karena tidak selalu ada.
        // Hanya customerType yang wajib.
        if (!customerType) return null;

        const { data } = await apiInstance.get(`/general/v4/customers/${nik}/quota`, {
            params: {
                familyId: familyIdEncrypted || '', // Kirim string kosong jika tidak ada
                customerType: customerType
            },
            headers: getHeaders(token),
        });

        if (data?.success && data.data.quotaRemaining) {
            const q = data.data.quotaRemaining;
            return {
                daily: q.daily ?? 0,
                monthly: q.monthly ?? 0,
                all: q.all ?? 0,
                family: q.family ?? 'N/A'
            };
        }
        return null;
    } catch (error) {
        return null;
    }
};

const postTransaction = async (payload, token) => {
    const { data } = await apiInstance.post("/general/v2/transactions", payload, { headers: getHeaders(token) });
    return data;
};

const getMonthlyReport = async (token) => {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const endDate = today.toISOString().split('T')[0];
    const { data } = await apiInstance.get("/general/v1/transactions/report", {
        params: { startDate, endDate }, headers: getHeaders(token),
    });
    if (!data?.success || !data?.data?.customersReport) {
        throw new Error("Gagal memuat laporan atau format data tidak sesuai.");
    }
    return data.data.customersReport;
};

const getTransactionsReport = async (token, startDate, endDate) => {
    const { data } = await apiInstance.get("/general/v1/transactions/report", {
        params: { startDate, endDate }, headers: getHeaders(token),
    });
    // Pengecekan: Pastikan customersReport adalah sebuah array
    if (data?.success && Array.isArray(data?.data?.customersReport)) {
        return data.data.customersReport; // Kembalikan array jika valid
    } else {
        // Jika tidak valid, kembalikan array kosong untuk mencegah error
        console.log(chalk.yellow(`\n   > Peringatan: Tidak ada data ringkasan laporan (customersReport) dari server.`));
        return [];
    }
};

const getTransactionsByCustomer = async (token, startDate, endDate, customerReportId) => {
    const { data } = await apiInstance.get("/general/v1/transactions", {
        params: { startDate, endDate, customerReportId }, headers: getHeaders(token),
    });
    // Pengecekan: Pastikan data.data.data adalah sebuah array
    if (data?.success && Array.isArray(data?.data?.data)) {
        return data.data.data; // Kembalikan array jika valid
    } else {
        // Jika tidak valid, kembalikan array kosong untuk mencegah error 'length'
        console.log(chalk.yellow(`\n   > Peringatan: Tidak ada data transaksi array untuk customerReportId ${customerReportId}. Melanjutkan...`));
        return []; 
    }
};

const getTransactionDetail = async (token, transactionId) => {
    const { data } = await apiInstance.get(`/general/v1/transactions/${transactionId}`, {
        headers: getHeaders(token),
    });
    if (!data?.success || !data?.data) {
        throw new Error(`Gagal memuat detail untuk transactionId: ${transactionId}`);
    }
    return data.data;
};

module.exports = {
    getProfileInfo, getProducts, getVerificationData, getQuota, postTransaction, getMonthlyReport,
    getTransactionsReport, getTransactionsByCustomer, getTransactionDetail,
};