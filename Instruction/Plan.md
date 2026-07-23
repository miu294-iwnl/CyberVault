# Full-Stack Cyber Vault (Server Backend & Native KDBX Database) - Implementation Plan

Tài liệu Kế hoạch Triển khai Ứng dụng Web Quản lý Mật khẩu Mã hóa Cá nhân & Quản trị Hệ thống với Giao diện Cyber Dark Grid, Tách biệt Tệp trang Modular và Lưu trữ Chuẩn KeePass `.kdbx`.

---

## 1. Kiến trúc Tổng quan & Cơ chế Mã hóa Zero-Knowledge

```
[ Master Password người dùng ]
       │
       ├───> (Trình duyệt Client) ── Mã hóa/Giải mã tệp <username>.kdbx trực tiếp trong RAM
       │                             └─> [ Nút Xuất File ] ──> Tải tệp nhị phân <username>.kdbx
       │                                                        (Mở KeePassXC/DX bằng Master Pass)
       └───> SHA256(Salt) ──> [ Auth Hash ] ──(Gửi REST API)──> [ Server bcrypt(AuthHash) ]
```

### Các quy tắc bảo mật cốt lõi:
1. **Zero-Knowledge Server Architecture**: Server chỉ lưu trữ tệp nhị phân BLOB `<username>.kdbx` đã mã hóa. Server KHÔNG BAO GIỜ lưu trữ hay biết Master Password của người dùng.
2. **Xác thực Đăng nhập Tách biệt**:
   - Tài khoản thông thường: Xác thực bằng `AuthHash = SHA256(MasterPassword + username)` mã hóa bcrypt trên Server.
   - Tài khoản Admin hệ thống (`admin`): Xác thực đăng nhập chuyên biệt, chuyển hướng thẳng đến Trang Quản Trị Admin (`/admin`), không cần tạo tệp kho KDBX.
3. **Chống Trình duyệt Hỏi Lưu Mật khẩu (Anti-Autofill Protection)**:
   - Sử dụng CSS `-webkit-text-security: disc` trên các trường nhập mật khẩu dạng `type="text"`.
   - Kết hợp các thuộc tính vô hiệu hóa autofill: `autocomplete="off"`, `data-lpignore="true"`, `data-bwignore="true"`, `data-1p-ignore="true"`.
4. **Tự động Khóa (Auto-Lock Vault)**: Khóa kho mật khẩu giải phóng RAM sau 5 phút không thao tác.

---

## 2. Kiến trúc Tách biệt Tệp Trang (Modular Page Architecture)

Ứng dụng được cấu trúc theo dạng **Application Shell + Modular Page Templates**:

- 📄 **`index.html`**: File Shell tối giản (~35 dòng HTML) đóng vai trò khung chứa chính.
- 📁 **`src/pages/`**: Thư mục chứa các phần trang được phân tách:
  - 📄 **`auth.html`**: Form Đăng nhập & Đăng ký tài khoản (`/login`, `/register`).
  - 📄 **`header.html`**: Thanh Top Header Navbar, Status Badge, Dropdown Profile Menu & Hamburger Mobile Menu.
  - 📄 **`database.html`**: Giao diện Kho mật khẩu KDBX (`/database`), Thanh tìm kiếm, Lọc danh mục & Switcher chế độ xem.
  - 📄 **`admin.html`**: Bảng điều khiển Quản trị Hệ thống (`/admin`), Thẻ thống kê & Bảng dữ liệu SQLite.
  - 📄 **`modals.html`**: Tất cả các cửa sổ Modal thoại (Thêm/Sửa mật khẩu, Generator, Đổi MK Kho, Đổi MK Admin, Thêm danh mục).
- 📜 **`src/main.js`**: Nạp đồng bộ các tệp trang HTML dạng raw template string (`?raw`), nạp an toàn vào DOM (`renderPageComponents`), điều hướng SPA Router và xử lý sự kiện.

---

## 3. Thiết kế Cơ sở Dữ liệu Máy chủ SQLite (`server/vault.db`)

### Bảng `users`
| Cột | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Khóa chính |
| `username` | `TEXT UNIQUE NOT NULL` | Tên tài khoản |
| `auth_hash` | `TEXT NOT NULL` | Bcrypt hash của AuthHash |
| `created_at` | `DATETIME DEFAULT CURRENT_TIMESTAMP` | Thời gian khởi tạo |

### Bảng `vaults`
| Cột | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Khóa chính |
| `user_id` | `INTEGER NOT NULL (FK -> users.id)` | Khóa ngoại người dùng |
| `filename` | `TEXT NOT NULL` | Tên tệp (`<username>.kdbx`) |
| `kdbx_data` | `BLOB NOT NULL` | Binary tệp `.kdbx` mã hóa |
| `size_bytes` | `INTEGER` | Kích thước tệp (Bytes) |
| `checksum` | `TEXT` | Hash SHA-256 toàn vẹn |
| `updated_at` | `DATETIME DEFAULT CURRENT_TIMESTAMP` | Thời gian cập nhật cuối |

### Bảng `audit_logs`
| Cột | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Khóa chính |
| `user_id` | `INTEGER (FK)` | ID người dùng |
| `action` | `TEXT NOT NULL` | Lịch sử thao tác (`REGISTER`, `LOGIN`, `ADMIN_CHANGE_PASS`, v.v.) |
| `ip_address` | `TEXT` | Địa chỉ IP |
| `created_at` | `DATETIME DEFAULT CURRENT_TIMESTAMP` | Thời gian ghi nhận |

---

## 4. Giao diện Cyber Dark Grid & Tối ưu Responsive Mobile

1. **Obsidian & Cyber Carbon Palette**: Tone nền tối sâu (`#06080c`), ô vuông ma trận Canvas động, điểm nhấn màu Neon Emerald (`#00ff9d`) và Neon Cyan (`#00f0ff`).
2. **Căn lề Khung chứa (Container Bounds)**:
   - Các trang `/database` và `/admin` đều bọc trong khung `.dashboard-container` / `.admin-container` đạt `max-width: 1280px` và `margin: 0 auto`.
3. **Căn lề Lưới Header Mobile**:
   - Trạng thái Server (`SERVER: ONLINE SYNC`) và Menu tài khoản nằm gọn gàng bên phải Header.
   - Trên giao diện Mobile (`< 768px`), nút Menu Tài khoản sát lề bên cạnh nút Hamburger Menu với khoảng cách `gap: 0.4rem`.

---

## 5. Kế hoạch Kiểm thử & Nghiệm thu (Verification Plan)

1. **Biên dịch Frontend**: Chạy `npm run build` kiểm tra tĩnh 0 lỗi TypeScript/Vite.
2. **Kiểm tra REST API Backend**: Đảm bảo toàn bộ API (`/api/register`, `/api/login`, `/api/vault/sync`, `/api/admin/users`, `/api/admin/change-password`) phản hồi chuẩn HTTP STATUS 200/403.
3. **Kiểm tra tính tương thích KeePass**: Xuất file `.kdbx` và mở trực tiếp bằng KeePassXC / KeePassDX với Master Password đã đặt.
