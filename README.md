# TEAM DOOM SK - Discord Bot

TEAM DOOM SK web sitesiyle entegre Discord botu.

## Komutlar

| Komut | Açıklama |
|---|---|
| `/kadro` | Tüm kadroyu Discord'da listeler |
| `/haberler` | Son 5 haberi gösterir |
| `/maclar` | Yaklaşan maçları gösterir |
| `/scout` | Scout başvuru linkini paylaşır |
| `/ping` | Bot sağlık kontrolü |

## Kurulum

1. `.env` dosyasını oluştur:
```
DISCORD_TOKEN=your_token
GUILD_ID=your_guild_id
SITE_API_URL=https://siteniz.com/admin/api.php
PORT=3000
```

2. `npm install`
3. `npm start`

## Deployment

Bu bot **Render.com** üzerinde ücretsiz çalışır.
UptimeRobot ile `/` endpoint'ini ping ederek 7/24 aktif tutulur.
