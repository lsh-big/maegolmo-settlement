# 매골모 회식비 정산

매너있는 골프 모임의 총무용 모바일 웹앱입니다. 회원, 회차, 입금 확인 기록은 현재 브라우저의 저장소에 보관됩니다. 같은 주소를 같은 브라우저에서 열면 기존 기록을 다시 볼 수 있습니다.

## 실행

PowerShell에서 다음 명령을 실행한 다음 [로컬 앱](http://localhost:8080)을 엽니다.

```powershell
cd C:\git\MGM\maegolmo-settlement
python -m http.server 8080 --bind 127.0.0.1 --directory dist
```

회차 목록의 **시연 회차 열기**에서 가상 참석자와 지출로 연습할 수 있습니다. 실제 기록은 **새 회차**에서 시작하세요.
