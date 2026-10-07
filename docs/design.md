# Ollie's Farm — lát mỏng (vertical slice), 2026-10-07

Mục tiêu: chơi thử xem vòng lặp nông trại có vui với trẻ không, trước khi đầu tư rộng. Hình ảnh sinh qua Game Asset Studio, cùng style "Word Island".

## Quyết định (tự chọn — có thể lật lại)

| # | Quyết định | Lý do |
|---|---|---|
| F1 | Game riêng (`D:\code\ollie-farm`), dùng chung style, cú Ollie, con gà đã thử | Thử nhanh; gộp vào Word Island sau vẫn được |
| F2 | HTML/CSS/JS thuần như Word Island, không engine | ~60 phần tử trên màn hình, DOM đủ nhanh; dùng lại APK wrapper |
| F3 | Cây: ngô (thức ăn cho gà, rẻ, 20 s), cà rốt (40 s), cà chua (60 s, mở ở cấp 2); gà ăn 1 ngô → 30 s sau đẻ 1 trứng | Có chuỗi sản xuất nhỏ (ngô → gà → trứng) ngay từ lát đầu |
| F4 | Đơn hàng chỉ gồm đồ đếm được (carrots, tomatoes, eggs), ghi "2 carrots" + đọc to bằng các clip ghép ("two carrots" + "and" + … + "please") | Học số đếm + số nhiều đúng ngữ pháp; "two corn" sai nên ngô không vào đơn |
| F5 | Gieo/thu hoạch bằng **vuốt tay** qua các ô (chọn hạt ở thanh dưới) | Cảm giác "đã tay" quen thuộc của game nông trại |
| F6 | Thời gian thực: lưu mốc giờ trồng/cho ăn; tắt app cây vẫn lớn | Đúng chất nông trại; thời gian ngắn để hợp trẻ em |
| F7 | Ollie đội mũ rơm ở góc, bong bóng gợi ý tiếng Việt suy ra từ trạng thái (có gì chín, gà đói, đơn giao được…) | Trẻ tự chơi không cần hướng dẫn chữ dài |
| F8 | Gà: hoạt hình AI 4 khung (đi, mổ) + code di chuyển trong chuồng; lật ngang khi đi sang trái | Kết quả thử nghiệm: mượt ở cỡ trong game |
| F9 | Không có quảng cáo, mua bán, chờ năng lượng; tiền chỉ để mua hạt | Game cho trẻ em |
| F10 | Dùng chung keystore với Word Island | Một chìa khoá để sao lưu |
