# Ollie's Farm — Nông trại của Ollie (bản thử 0.1)

Game nông trại offline cho trẻ em, vừa chơi vừa học tiếng Anh. Mọi hình ảnh do Game Asset Studio (app sinh asset chạy local, repo riêng) sinh bằng OpenAI GPT Image (cùng style với [Word Island](https://github.com/taibt-devops/word-island)); con gà có hoạt hình AI từng khung (đi bộ, mổ thóc).

## Chơi

- Máy tính: mở `game\index.html` bằng Chrome / Edge.
- Android: cài `dist\OllieFarm-0.1.apk` (~2 MB, không xin quyền gì, không cần mạng). Cách cài giống Word Island.

## Vòng chơi

1. Chọn túi hạt ở thanh dưới (ngô 1 xu, cà rốt 2 xu; cà chua 3 xu mở ở cấp 2), **chạm hoặc vuốt** qua ô đất để gieo.
2. Cây lớn qua 4 giai đoạn (ngô 20 giây, cà rốt 40, cà chua 60) — **vẫn lớn khi tắt app**.
3. Cây chín lấp lánh → vuốt qua để thu hoạch vào kho (Ollie đọc tên tiếng Anh).
4. Chạm con gà để cho ăn 1 ngô → 30 giây sau gà đẻ trứng → chạm quả trứng để nhặt.
5. Giao **đơn hàng tiếng Anh** ("2 carrots and 1 egg", bấm 🔊 để nghe) → nhận xu + kinh nghiệm → lên cấp.

Ollie (đội mũ rơm) ở góc màn hình luôn gợi ý bước tiếp theo bằng tiếng Việt. Không có quảng cáo, không mua bán, không chờ năng lượng; nếu bé hết xu và không còn gì để bán, Ollie tặng xu để chơi tiếp.

## Sửa / thêm nội dung

```powershell
$py = 'D:\code\game-asset-studio\.venv\Scripts\python.exe'   # Game Asset Studio phải đang chạy
& $py tools\farm_assets.py gen [--redo item-tomato]   # sinh ảnh còn thiếu (danh sách ở content\farm.json)
& $py tools\farm_assets.py sheet                      # build\sheet.png để duyệt
& $py tools\farm_audio.py                             # giọng đọc (OpenAI TTS)
& $py tools\farm_assets.py export                     # chép ảnh vào game\ + viết game\data.js
.\android\build-apk.ps1                               # APK (tăng versionCode trước khi cài đè)
```

Cân bằng game (giá hạt, thời gian lớn, thưởng, cấp độ) ở đầu `game\farm.js` (`CROPS`, `EGG_LAY`, `VALUE`, `LEVEL_XP`).

APK ký bằng **cùng keystore với Word Island** (`android\keystore\`, gitignored) — sao lưu một lần cho cả hai.
