Sistem Pangkalan Cerdas v6.0 🚀

Sebuah command-line tool canggih untuk membantu mengelola dan mengotomatisasi pencatatan transaksi harian di pangkalan gas melon Anda. Dirancang untuk efisiensi, akurasi, dan keamanan jangka panjang.

✨ Fitur Unggulan

    🤖 Mode Cerdas: Secara otomatis membuat rencana distribusi harian berdasarkan stok dan riwayat pelanggan multi-pangkalan.

    ⚡ Transaksi Cepat: Lakukan transaksi satu per satu langsung dari terminal tanpa perlu membuka file Excel.

    📊 Laporan Interaktif: Lihat laporan penjualan bulanan atau dengan rentang waktu kustom langsung di terminal dalam bentuk tabel.

    🛡️ Anti-Deteksi: Dilengkapi jeda acak dan penyamaran User-Agent untuk meniru perilaku manusia, menjaga sistem Anda tetap aman saat berkomunikasi dengan server Pritimini.

    🔄 Sinkronisasi Kuota: Perbarui data kuota semua pelanggan di master log Anda langsung dari sistem scibiditepat.

    💅 Tampilan Modern: Antarmuka terminal yang berwarna, informatif, dan dilengkapi dengan progress bar yang memuaskan.

    💾 Keamanan Data: Fitur backup otomatis untuk melindungi file master log Anda dari kerusakan.

⚙️ Tutorial Instalasi

Ikuti langkah-langkah ini dari awal untuk menjalankan sistem.

Prasyarat

Pastikan Anda sudah menginstal Node.js di komputer Anda. Anda bisa mengunduhnya dari situs resmi Node.js.

Langkah-langkah

    Siapkan Folder Proyek

        Buat sebuah folder baru di komputer Anda, misalnya sistem-pangkalan-cerdas.

        Salin semua file script (index.js, api.js, ui.js, excel.js, config.json) ke dalam folder tersebut.

    Buka Terminal

        Buka terminal atau Command Prompt langsung di dalam folder sistem-pangkalan-cerdas.

    Instal Semua Kebutuhan (Dependencies)

        Jalankan perintah di bawah ini dan tunggu hingga prosesnya selesai. Perintah ini akan mengunduh semua library yang dibutuhkan oleh script.

        npm install

    Siapkan Folder Input & Output

        Di dalam folder sistem-pangkalan-cerdas, buat dua folder baru:

            input

            output

    Konfigurasi Awal (Opsional)

        Buka file config.json. Anda bisa menyesuaikan beberapa pengaturan jika perlu, misalnya batasPerPangkalan (jumlah maksimal transaksi per NIK di satu pangkalan dalam sebulan).

▶️ Cara Menjalankan

Setelah instalasi selesai, setiap kali Anda ingin menjalankan sistem:

    Buka terminal di dalam folder proyek Anda.

    Jalankan perintah:

    node index.js

    Sistem akan berjalan dan Anda akan disambut dengan menu utama.
