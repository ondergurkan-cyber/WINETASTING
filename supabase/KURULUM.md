# Cihazlar arası senkron: kurulum (bir kez, yaklaşık 10 dakika)

Uygulama verileri artık ücretsiz bir Supabase hesabında da tutulur. iPhone, iPad ve bilgisayar aynı hesapla
giriş yapınca aynı event'leri, şarapları, mahzeni, satıcıları, fotoğrafları ve ayarları görür.
Sinyal yokken çalışmaya devam eder, internet gelince kendiliğinden eşitlenir.

## 1. Supabase projesi aç
1. https://supabase.com adresine git, **Start your project** de, GitHub hesabınla giriş yap.
2. **New project**: ad `tasting`, bir veritabanı şifresi belirle (bir yere not et, uygulamada gerekmez),
   bölge olarak **Central EU (Frankfurt)** seç, plan **Free**. **Create new project**.
3. Proje hazırlanırken 1-2 dakika bekle.

## 2. Veritabanını kur
1. Soldaki menüden **SQL Editor**'ü aç, **New query**.
2. Bu depodaki `supabase/setup.sql` dosyasının tamamını kopyala, yapıştır, **Run** de.
   "Success. No rows returned" görmelisin.

## 3. E-posta onayını kapat (önerilir)
**Authentication → Sign In / Providers → Email** altında **Confirm email**'i kapat, **Save**.
(Açık kalırsa hesap açarken gelen e-postadaki bağlantıya tıklaman gerekir.)

## 4. İki değeri uygulamaya ver
**Project Settings → API Keys** (veya **Data API**) sayfasında:
- **Project URL** (`https://xxxx.supabase.co`)
- **Publishable key** (`sb_publishable_…`; eski projelerde adı **anon public**)

Bu iki değer gizli değildir, web sayfasının içinde herkese açık durur; veritabanı yalnızca giriş yapan kişiye
kendi kayıtlarını gösterir. Bunları Claude'a yazabilir ya da `js/config.js` dosyasına kendin koyabilirsin.
**secret** veya **service_role** anahtarını asla paylaşma ve hiçbir yere yazma.

## 5. Her cihazda giriş yap
Uygulamada **Settings → Your devices**:
- İlk cihazda e-posta + şifre yazıp **Create account**.
- Diğer cihazlarda aynı bilgilerle **Sign in**.

Her cihazda daha önce girdiğin veriler hesaba eklenir, hiçbir şey silinmez ve kopya oluşmaz.
Sol üstteki küçük bulut durumu gösterir: yeşil nokta senkron, sarı bekleyen değişiklik var (ör. çevrimdışı),
kırmızı bir sorun var, boş halka giriş yapılmamış.

## 6. (İsteğe bağlı) Başkalarının hesap açmasını kapat
Tüm cihazlarında giriş yaptıktan sonra **Authentication → Sign In / Providers** altında
**Allow new users to sign up**'ı kapatabilirsin. Kimse senin projende hesap açamaz.

## Bilmekte fayda var
- Ücretsiz planda 500 MB veri + 1 GB fotoğraf alanı var; tek dosya en fazla 50 MB. Daha büyük videolar
  yalnızca çekildiği cihazda kalır.
- Ücretsiz Supabase projeleri **7 gün hiç kullanılmazsa** uykuya alınır. Veriler silinmez; supabase.com'da
  projeyi açıp **Restore** demek yeterli. Bu sırada uygulama cihazda çalışmaya devam eder.
- Anthropic API anahtarın senkronlanmaz, her cihazda ayrı girilir.
- Aynı kaydı iki cihazda farklı değiştirirsen, en son yapılan değişiklik geçerli olur.
