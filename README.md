# CYBERVAULT - KEEPASS KDBX PASSWORD MANAGER

Trình quản lý mật khẩu mã hóa chuẩn KeePass `.kdbx` với kiến trúc bảo mật Zero-Knowledge, giao diện Cyber Dark Grid hiện đại và bảng điều khiển quản trị máy chủ.

---

## 1. Giới Thiệu Dự Án

CyberVault là một giải pháp quản lý mật khẩu mã hóa cao cấp, cho phép người dùng lưu trữ, tìm kiếm, phát sinh và bảo mật toàn bộ thông tin đăng nhập cá nhân. Khác với các hệ thống quản lý mật khẩu thông thường, CyberVault vận hành theo cơ chế Zero-Knowledge Architecture, trong đó dữ liệu luôn được mã hóa trực tiếp trong bộ nhớ RAM của Client trước khi lưu trữ dưới dạng tệp chuẩn KeePass `.kdbx`.

---

## 2. Tính Năng Cốt Lõi

### 2.1. Bảo Mật Zero-Knowledge & Tách Biệt Khóa Mã Hóa
- **Mã Hóa Native KDBX v4**: Mật khẩu và ghi chú được mã hóa chuẩn AES-256 / Argon2 / AES-KDF trực tiếp trong RAM trình duyệt Client bằng thư viện `kdbxweb`.
- **Tách Biệt Khóa Xác Thực & Khóa Mã Hóa**:
  - `MasterPassword`: Dùng giải mã kho `.kdbx` 100% tại Client. Server KHÔNG BAO GIỜ biết hay lưu giữ Master Password.
  - `AuthHash`: Được tính bằng `SHA256(MasterPassword + username)` tại Client trước khi gửi lên Server để xác thực đăng nhập.
- **Tự Động Khóa Kho (Auto-Lock)**: Tự động giải phóng RAM và khóa ứng dụng về màn hình Auth sau 5 phút không có thao tác.
- **Tự Hủy Clipboard**: Tự động xóa mật khẩu đã copy khỏi bộ nhớ tạm sau 10 giây.

### 2.2. Vô Hiệu Hóa Trình Quản Lý Mật Khẩu Trình Duyệt (Anti-Autofill)
- Áp dụng kỹ thuật CSS Text Masking `-webkit-text-security: disc` cho trường nhập liệu dạng `type="text"`.
- Ngăn chặn hoàn toàn việc các trình quản lý mật khẩu (Chrome, Edge, Firefox, Bitwarden, 1Password) tự động hiện popup hỏi lưu mật khẩu tài khoản khi thêm hoặc sửa dữ liệu.

### 2.3. Tương Thích Chuẩn KeePass 100% (1-Click Export)
- Hỗ trợ xuất trực tiếp tệp nhị phân `<username>.kdbx` xuống máy tính hoặc điện thoại.
- Tệp `.kdbx` xuất ra có thể mở trực tiếp trên các phần mềm KeePassXC, KeePassDX, KeePass2 bằng chính Mật khẩu tài khoản Web của bạn.

### 2.4. Bảng Điều Khiển Quản Trị Hệ Thống (System Admin Dashboard)
- Tài khoản Admin chuyên biệt (`admin`) có đường dẫn và quyền hạn riêng, chuyển hướng thẳng đến Trang Quản Trị (`/admin`), không cần tạo tệp kho KDBX.
- Bảo vệ tuyến đường chặt chẽ (Strict Route Guards) cả phía Client Router và REST API Backend.
- Bảng thống kê dữ liệu người dùng, dung lượng kho lưu trữ SQLite và giao diện đổi mật khẩu Admin (`POST /api/admin/change-password`).

### 2.5. Kiến Trúc Phân Tách Trang Modular (Modular Component Architecture)
- **`index.html`**: Application Shell siêu gọn (~35 dòng HTML).
- **`src/pages/`**: Thư mục phân tách các phần trang giao diện:
  - `auth.html`: Giao diện Đăng nhập / Đăng ký (`/login`, `/register`).
  - `header.html`: Top Header Navbar, Status Badge, Profile Dropdown Menu & Mobile Hamburger Drawer.
  - `database.html`: Bảng điều khiển Kho mật khẩu KDBX (`/database`), Thanh tìm kiếm, Lọc danh mục & Switcher chế độ xem.
  - `admin.html`: Bảng điều khiển Quản trị Admin (`/admin`), Thẻ thống kê & Bảng tài khoản SQLite.
  - `modals.html`: Các cửa sổ Modal thoại (Thêm/Sửa mật khẩu, Generator, Đổi MK Kho, Đổi MK Admin, Thêm danh mục).
- **`src/main.js`**: Nạp đồng bộ các tệp trang HTML dạng raw template string (`?raw`), nạp an toàn vào DOM (`renderPageComponents`).

### 2.6. Giao Diện Cyber Dark Grid & Tối Ưu Mobile
- Phong cách đồ họa Obsidian Dark Grid kết hợp hiệu ứng Canvas ma trận dynamically.
- Căn lề khung chứa tiêu chuẩn `max-width: 1280px` và `margin: 0 auto`.
- Tối ưu hiển thị Responsive trên thiết bị di động, Menu tài khoản và Hamburger menu nằm sát lề bên phải gọn gàng.

---

## 3. Công Nghệ Sử Dụng

| Tầng (Layer) | Công Nghệ / Thư Viện |
| :--- | :--- |
| **Frontend Core** | Vanilla HTML5, CSS3 Custom Properties, JavaScript ES6 Modules |
| **Bundler** | Vite v5.x |
| **KDBX Engine** | `kdbxweb`, Web Crypto API |
| **Backend Server** | Node.js, Express.js |
| **Database** | SQLite3 (`server/vault.db`) |
| **Security Backend** | Bcrypt, Express Rate Limit, CORS |

---

## 4. Danh Sách REST API Endpoints Backend

| Method | Endpoint | Mô Tả | Quyền Truy Cập |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/register` | Đăng ký tài khoản mới & Khởi tạo tệp `.kdbx` | Public |
| `POST` | `/api/login` | Đăng nhập xác thực & Nhận tệp `.kdbx` | Public |
| `POST` | `/api/vault/sync` | Đồng bộ tệp `.kdbx` mới lên CSDL SQLite | Logged-in User |
| `GET` | `/api/admin/users` | Lấy danh sách tài khoản & dung lượng kho | `requester=admin` |
| `DELETE` | `/api/admin/users/:username` | Xóa tài khoản & tệp kho KDBX khỏi Server | `requester=admin` |
| `POST` | `/api/admin/change-password` | Đổi mật khẩu tài khoản Admin | `requester=admin` |

---

## 5. Cấu Trúc Mã Nguồn Thư Mục

```
keepass-cyber-vault/
├── Instruction/
│   ├── Plan.md                # Kế hoạch triển khai kiến trúc hệ thống
│   └── Walkthrough.md         # Báo cáo nghiệm thu & hướng dẫn kỹ thuật
├── server/
│   ├── db.js                  # Khởi tạo CSDL SQLite (users, vaults, audit_logs)
│   ├── index.js               # Express REST API Server Backend
│   └── vault.db               # Tệp CSDL SQLite lưu trữ binary BLOB .kdbx
├── src/
│   ├── components/
│   │   └── matrixGrid.js      # Trình vẽ Canvas ma trận Cyber Security
│   ├── crypto/
│   │   └── kdbxVault.js       # Client kdbxweb engine & Hash KDF
│   ├── pages/
│   │   ├── admin.html         # Trang Quản trị System Admin
│   │   ├── auth.html          # Trang Đăng nhập / Đăng ký
│   │   ├── database.html      # Trang Kho mật khẩu KDBX
│   │   ├── header.html        # Thanh Top Header Navbar
│   │   └── modals.html        # Tất cả các cửa sổ Modal thoại
│   ├── main.js                # UI Controller, SPA Router & Dynamic Component Loader
│   └── style.css              # Cyber Dark Design System & Responsive CSS
├── index.html                 # Lean Application Shell
├── package.json               # Full-Stack Dependencies & npm scripts
└── vite.config.js             # Vite Bundler Config
```

---

## 6. Hướng Dẫn Cài Đặt & Chạy Cục Bộ (Local Setup)

### Yêu cầu môi trường:
- **Node.js**: `>= v18.0.0`
- **npm**: `>= 8.0.0`

### Các bước thực hiện:

1. **Cài đặt thư viện phụ thuộc**:
   ```bash
   npm install
   ```

2. **Khởi chạy Express Backend Server (Port 3001)**:
   ```bash
   npm run server
   ```

3. **Khởi chạy Vite Frontend Dev Server (Port 3000)** *(Mở terminal thứ 2)*:
   ```bash
   npm run dev
   ```

4. Truy cập ứng dụng trên trình duyệt: `http://localhost:3000/`

---

## 7. Tài Khoản Mặc Định Thử Nghiệm

- **Tài khoản Admin Máy chủ**:
  - **Username**: `admin`
  - **Password**: `admin123`
  - *(Đăng nhập tự động chuyển thẳng tới trang `/admin`)*
- **Tài khoản Người Dùng**:
  - Tự do đăng ký mới tại màn hình `/register` để tạo kho `.kdbx` mã hóa cá nhân.

---

## 8. Hướng Dẫn Triển Khai Production Online (Deployment)

Dự án đã được tích hợp cơ chế Single Server (Express Server tự động nhận diện và nạp các tệp build `dist/` khi biên dịch sản phẩm).

### Cách 1: Đưa lên Render.com (Miễn phí - Đề xuất)
1. Đẩy toàn bộ mã nguồn dự án lên GitHub.
2. Truy cập Render.com -> Chọn New Web Service -> Kết nối GitHub Repository.
3. Cấu hình các thông số:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node server/index.js`
4. Render sẽ tự động cấp một URL có HTTPS bảo mật dạng `https://cybervault.onrender.com`.

### Cách 2: Triển khai trên VPS Linux (Ubuntu với PM2 & NGINX)
```bash
git clone <URL_REPOSITORY>
cd keepass-cyber-vault
npm install
npm run build
pm2 start server/index.js --name "cybervault"
```

---

## 9. Giấy Phép (License)

Dự án phát triển và phát hành theo giấy phép MIT License.
