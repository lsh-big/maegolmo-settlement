# 매골모 회식비 정산

매너있는 골프 모임의 총무용 모바일 웹앱입니다. 회원, 회차, 입금 확인 기록은 현재 브라우저의 저장소에 보관됩니다. 같은 주소를 같은 브라우저에서 열면 기존 기록을 다시 볼 수 있습니다.

## 실행

PowerShell에서 다음 명령을 실행한 다음 [로컬 앱](http://localhost:8080)을 엽니다.

```powershell
cd C:\git\MGM\maegolmo-settlement
python -m http.server 8080 --bind 127.0.0.1 --directory dist
```

회차 목록의 **시연 회차 열기**에서 가상 참석자와 지출로 연습할 수 있습니다. 실제 기록은 **새 회차**에서 시작하세요.

## Firebase Hosting에 게시

[Firebase 콘솔](https://console.firebase.google.com/)에서 Firebase 프로젝트를 만든 뒤 프로젝트 ID를 확인하세요. 이 폴더에서 PowerShell로 다음 명령을 실행합니다.

```powershell
npx firebase-tools login
npx firebase-tools deploy --only hosting --project YOUR_PROJECT_ID
```

`YOUR_PROJECT_ID`를 콘솔에 표시된 프로젝트 ID로 바꿉니다. 게시가 끝나면 CLI에 표시되는 Hosting URL을 휴대폰에서 엽니다. [Firebase Hosting 공식 가이드](https://firebase.google.com/docs/hosting/quickstart)

Hosting 주소로 앱 화면을 열 수 있습니다. 회원, 회차, 입금 기록과 영수증 사진은 해당 주소를 연 브라우저에 저장됩니다. 기존 Sites나 로컬 주소의 기록은 새 주소로 자동 이전되지 않습니다.
