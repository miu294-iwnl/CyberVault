# Cyber Vault (KeePass KDBX Password Manager) - Walkthrough & Technical Report

Ứng dụng **Cyber Vault** đã được triển khai hoàn chỉnh theo kiến trúc **Full-Stack (Vite Frontend + Express Backend + SQLite Database)** với giao diện **Cyber Dark Grid** cao cấp, tách biệt các tệp trang modular trong `src/pages/` và lưu trữ chuẩn KeePass `.kdbx` tương thích 100% với các phần mềm KeePass.

---

## 1. Danh sách Tính năng Đã Hoàn Thành 100%

### 🛡️ 1. Kiến trúc Bảo mật & Mã hóa Zero-Knowledge
- **Mã hóa KeePass KDBX 100% trên RAM Client**:
  - `MasterPassword`: Dùng giải mã kho `.kdbx` trực tiếp tại Client. Server không bao giờ nhận hay lưu Master Password.
  - `AuthHash`: Được tính bằng `SHA256(MasterPassword + username)` trước khi gửi lên Server xác thực.
- **Vô hiệu hóa Trình Quản Lý Mật Khẩu Trình Duyệt (Anti-Autofill Protection)**:
  - Áp dụng CSS Text Masking `-webkit-text-security: disc` cho ô nhập `type="text"`.
  - Kết hợp bộ thuộc tính ngăn chặn autofill trình duyệt: `autocomplete="off"`, `data-lpignore="true"`, `data-bwignore="true"`, `data-1p-ignore="true"`.
- **Tự động Khóa Kho (Auto-Lock)**: Tự đếm ngược 5 phút không thao tác -> Tự xóa dữ liệu RAM và khóa về trang Đăng nhập.
- **Tự hủy Clipboard**: Tự động xóa Username / Password khỏi Clipboard sau 10 giây khi bấm Copy.

### 🛡️ 2. Luồng Quản Trị Hệ Thống Chuyên Biệt (System Admin Dashboard)
- **Tài khoản Admin Hệ thống (`admin` / `admin123`)**:
  - Đăng nhập tài khoản `admin` sẽ tự động chuyển hướng thẳng đến Trang Quản Trị Admin (`/admin`), không cần tạo tệp kho KDBX.
  - Bảo vệ tuyến đường chặt chẽ ở cả Client (`handleRoute`) và Server API (`requester=admin` check). Người dùng thông thường cố tình truy cập `/admin` sẽ bị từ chối truy cập.
- **Thay đổi Mật khẩu Admin**:
  - Bổ sung nút `🔑 Đổi Mật Khẩu Admin` trong Menu thả xuống Profile (chỉ hiển thị khi đăng nhập với quyền `admin`).
  - Hỗ trợ đổi mật khẩu Admin qua REST API Endpoint `POST /api/admin/change-password`.

### 🧩 3. Cấu trúc Phân Tách Tệp Trang (Modular HTML Component Pages)
Tách rời các phần giao diện khỏi file gốc `index.html` vào thư mục **`src/pages/`**:
- `src/pages/auth.html`: Giao diện Đăng nhập / Đăng ký (`/login`, `/register`).
- `src/pages/header.html`: Top Header Navbar, Server Status Badge, Profile Dropdown Menu & Mobile Hamburger Drawer.
- `src/pages/database.html`: Bảng điều khiển Kho mật khẩu KDBX (`/database`), Thanh tìm kiếm, Lọc danh mục & Switcher chế độ xem.
- `src/pages/admin.html`: Bảng điều khiển Quản trị Admin (`/admin`), Thẻ thống kê & Bảng tài khoản SQLite.
- `src/pages/modals.html`: Toàn bộ các cửa sổ Modal thoại (Thêm/Sửa mật khẩu, Generator, Đổi MK Kho, Đổi MK Admin, Thêm danh mục).
- `index.html`: File Application Shell cực kỳ tối giản (~35 dòng HTML).
- `src/main.js`: Nạp đồng bộ các tệp trang HTML dạng raw template string (`?raw`), nạp an toàn vào DOM (`renderPageComponents`), bảo đảm không bị crash script hay mất giao diện.

### 📱 4. Tối ưu Giao diện Mobile & Căn Lề Chuẩn Mực
- **Căn Lề Khung Chứa (Container Alignment)**:
  - Cả 2 trang Kho mật khẩu (`.dashboard-container`) và Quản trị Admin (`.admin-container`) đều bọc chuẩn `max-width: 1280px` và `margin: 0 auto`.
- **Căn Lề Header Mobile**:
  - Nút Menu Tài khoản (`.vault-dropdown-wrapper`) và nút Hamburger Menu Danh mục/Tìm kiếm (`.mobile-menu-wrapper`) nằm sát cạnh nhau bên lề phải Header trên thiết bị di động (`gap: 0.4rem`).
  - Dropdown Menu tài khoản thả xuống căn sát lề phải (`right: 0`), không tràn khung hay vỡ vị trí.
- **Thao tác Ghi chú Bổ sung**: Thẻ `textarea.cyber-input` được cấu hình `resize: vertical; min-height: 80px;`, chỉ cho phép kéo dài xuống dưới mà không bị biến dạng chiều ngang.

---

## 2. Bảng Danh Sách Endpoint REST API (`server/index.js`)

| Phương thức | Đường dẫn API | Mô tả | Quyền hạn |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/register` | Đăng ký tài khoản mới & Khởi tạo tệp `.kdbx` | Tất cả |
| `POST` | `/api/login` | Đăng nhập tài khoản & Nhận tệp `.kdbx` | Tất cả |
| `POST` | `/api/vault/sync` | Đồng bộ tệp `.kdbx` mới lên CSDL SQLite | Đã đăng nhập |
| `GET` | `/api/admin/users` | Lấy danh sách tài khoản & dung lượng kho | `requester=admin` |
| `DELETE` | `/api/admin/users/:username` | Xóa tài khoản & tệp kho KDBX khỏi Server | `requester=admin` |
| `POST` | `/api/admin/change-password` | Đổi mật khẩu tài khoản Admin | `requester=admin` |

---

## 3. Cấu trúc Thư mục Dự án Hoàn chỉnh

```
h:/Antigravity/Keepas web/
├── Instruction/
│   ├── Plan.md                # Tài liệu Kế hoạch Triển khai Hệ thống
│   └── Walkthrough.md         # Báo cáo Nghiệm thu & Hướng dẫn Kỹ thuật
├── server/
│   ├── db.js                  # Khởi tạo CSDL SQLite (users, vaults, audit_logs)
│   ├── index.js               # Express REST API Server Backend (Port 3001)
│   └── vault.db               # Database SQLite lưu trữ tệp BLOB .kdbx
├── src/
│   ├── components/
│   │   └── matrixGrid.js      # Trình vẽ Canvas ma trận Cyber Security
│   ├── crypto/
│   │   └── kdbxVault.js       # Client kdbxweb engine & Hash KDF
│   ├── pages/
│   │   ├── admin.html         # Giao diện Trang Quản trị System Admin
│   │   ├── auth.html          # Giao diện Đăng nhập / Đăng ký
│   │   ├── database.html      # Giao diện Kho mật khẩu KDBX
│   │   ├── header.html        # Giao diện Thanh Top Header Navbar
│   │   └── modals.html        # Giao diện Cửa sổ Modal thoại
│   ├── main.js                # App Controller, Router & Dynamic Component Loader
│   └── style.css              # Cyber Dark Grid Styling System & Responsive CSS
├── index.html                 # Lean Application Shell
├── package.json               # Full-Stack Dependencies & npm scripts
└── vite.config.js             # Vite Bundler Config
```

---

## 4. Hướng dẫn Khởi chạy & Kiểm thử Dự án

### Khởi chạy Máy chủ Backend & Frontend
1. **Khởi chạy Node Express Backend**:
   ```bash
   npm run server
   # Server lắng nghe tại: http://localhost:3001
   ```
2. **Khởi chạy Vite Frontend Dev Server**:
   ```bash
   npm run dev
   # Trình duyệt mở tại: http://localhost:3000/
   ```

### Tài khoản Kiểm thử Hệ thống
- **Tài khoản Admin**: Username: `admin` / Password: `admin123` -> Chuyển hướng trực tiếp đến Dashboard Admin (`/admin`).
- **Tài khoản User**: Đăng ký tự do tại màn hình `/register`, tạo kho mật khẩu `.kdbx` mã hóa riêng biệt.

### Kiểm tra Xuất tệp KDBX Tương thích
1. Đăng nhập tài khoản User bất kỳ, thêm các mục mật khẩu.
2. Nhấp vào Menu Profile -> Chọn **"💾 Xuất File Database (.kdbx)"**.
3. Tệp `<username>.kdbx` tải xuống máy có thể mở 100% bằng ứng dụng **KeePassXC / KeePassDX** bằng chính Mật khẩu tài khoản Web!
