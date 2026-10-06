# Juke Portfolyo — Claude Code Prompt

> Bu prompt'u Claude Code'a **olduğu gibi** yapıştır. Proje klasörüne şu dosyaları önceden koy:
> - `public/models/juke.glb` → parçalara ayrılmış, isimlendirilmiş model (hazır)
> - `public/bg/room.jpg` → arka plan fotoğrafı
> - `public/bg/depth.png` → derinlik haritası
> - `public/bg/mask_sun.png`, `mask_lamp.png`, `mask_fishbowl.png`, `mask_pennant.png` → siyah-beyaz maskeler
> - `public/projects/` → proje görsellerin (şimdilik boş, sonradan eklenecek)
> - `references/` → görsel referans (siteye dahil değil, sadece tasarım rehberi):
>   - `dvd_design_sheet.webp` → DVD kutusu, sırt, arka yüz, disk ve yığın tasarımları

---

## PROMPT

Bir portfolyo sitesi yapacağız. Ana ekranda, fotoğraf arka planlı bir odada **Juke** adında, kafası teyp (boombox) olan canlı bir 3D karakter duruyor. Yanında havada hafifçe süzülen DVD'ler var. Her DVD benim bir projem. DVD'ye tıklayınca Juke onu alıp kaset bölmesine takıyor, kamera kaset penceresine yaklaşıyor ve proje sayfası açılıyor. Juke **asla durgun olmamalı**. Sevimli, eğlenceli ve "canlı bir şey" hissi vermeli.

Bu işi **aşamalar halinde** yapacağız. Her aşamanın sonunda dur, tarayıcıda ekran görüntüsü alıp sonucu kendin kontrol et, bana kısa bir özet ver ve onayımı bekle. Bir sonraki aşamaya kendiliğinden geçme.

### Teknoloji
- Vite + React + TypeScript
- `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`
- Animasyon: GSAP (zaman çizelgeli geçişler için) + `useFrame` içinde prosedürel hareket
- Durum yönetimi: `zustand`
- Proje verisi: `src/data/projects.ts` (başlık, kısa açıklama, kapak görseli, renk, teknolojiler, linkler, **Juke'un o projeye özel ifadesi**)

**DVD tasarımı için `references/dvd_design_sheet.webp` görseline bak.** Bu görsel sadece DVD'lerin tasarımı için rehber. Karakterin ve odanın görünümü için değil. Birebir kopyalama, aynı tarzı yakala.

### Model hakkında bilmen gerekenler (`public/models/juke.glb`)
Model Meshy AI ile üretildi ve parçalara ayrılıp isimlendirildi. Tek materyal var (`juke_mat`, PBR: renk, metallic-roughness ve normal dokuları). Toplam yaklaşık 1.100 üçgen. Birimler: karakter **1 birim boyunda** (y: -0.5 → 0.5). Ön yüz **+Z** yönünde. `_L` = ekranın solu (-X), `_R` = ekranın sağı (+X).

Hiyerarşi ve dönme noktaları (pivotlar) **zaten doğru ayarlı**:

```
Juke (kök)
├─ head            pivot: boyun (kutunun alt ortası) → kafa eğme/sallama buradan
│  ├─ speaker_L    pivot: hoparlör merkezi  → └─ speaker_L_cap (göbek)
│  ├─ speaker_R    pivot: hoparlör merkezi  → └─ speaker_R_cap
│  ├─ button_1..4  pivot: düğme merkezi (soldan sağa 1,2,3,4) → basılınca -Y yönünde ~0.015 iner
│  ├─ handle       pivot: sapın alt ortası (menteşe) → └─ handle_grip
│  └─ cassette_door  pivot: kapağın ALT-ÖN kenarı (menteşe). rotation.x pozitif ≈ 1.2 rad → kapak öne doğru açılır
│        ├─ cassette_eye_L
│        └─ cassette_eye_R   (kaset üzerindeki küçük göz çizgileri)
├─ torso           pivot: tişörtün alt ortası
├─ hand_L, hand_R  pivot: el merkezi. KOL YOK, eller Rayman gibi havada duruyor
├─ leg_L, leg_R    pivot: kalça (bacağın üstü)
│  └─ shoe_L / shoe_R → └─ shoe_L_tip / shoe_R_tip
```

Önemli notlar:
- Hoparlörlerin dokusunda **basılı gözler** var. Bunları kapatmak için her hoparlörün önüne (göbeğin hemen önüne, ~0.003 öne) dairesel bir **göz plakası** koy. Plakanın boyutunu ve konumunu hoparlörün bounding box'ından hesapla, sabit sayı yazma.
- Kapak açılınca arkasında boşluk yoksa, kapağın arkasına karanlık bir "kaset yuvası" kutusu ekle.
- Model düşük poligonlu. Gerekirse `computeVertexNormals` ile yumuşat ama kutu kenarları keskin kalsın.
- Dokular yaklaşık 4,7 MB. Build adımında `@gltf-transform/cli` ile dokuları 1024 px WebP'ye düşür ve Draco ile sıkıştır. Hedef boyut 1,5 MB'ın altı.

---

### AŞAMA 1 — Sahne iskeleti ve Juke'un yüklenmesi
1. Projeyi kur. Tam ekran `<Canvas>`, sabit bir kamera (hafif alttan, ~35° FOV) kullan. Juke ekranın ortasının biraz solunda dursun.
2. `gltfjsx` ile modeli bir `Juke.tsx` bileşenine çevir. Her parçaya `ref` ile erişilebilsin.
3. Görünüm: modelin dokusunu koru ama **çizgi film hissi** ver. Hafif toon tarzı ışık rampası (3–4 kademe), ince siyah dış çizgi (inverted hull ya da drei `<Outlines>`) ve yumuşak rim light kullan.
4. **Arka planı şimdiden koy:** `public/bg/room.jpg`'yi efektsiz, düz olarak arkaya yerleştir. Juke'u ranzanın önündeki halının üstüne, odanın ölçeğine uygun boyutta koy. Karakterin ışığı ve gölgesi baştan bu odaya göre kurulsun (detaylar Aşama 7'nin 9. maddesinde, ışık kurulumunu şimdi yap). Efektler Aşama 7'de gelecek.
5. **Işık ve gölgelendirme:** soldan-önden sıcak turuncu ana ışık, yeşilimsi soğuk dolgu ışığı ve arkadan ince turuncu rim light kullan. Juke'un altında yumuşak temas gölgesi, sağa-arkaya uzanan bir gölge olsun. Teyp kutusunun kenarlarında hafif speküler parlama olsun ama plastik görünmesin.
6. Geliştirme sırasında Leva ile pivot, ışık ve renk ayarlarını canlı değiştirebileyim.

### AŞAMA 2 — Yüz ve ifade sistemi
Ağzı yok. **Bütün duygu gözlerle, kaşlarla ve beden diliyle** anlatılacak.

1. **Göz plakaları:** her hoparlörün önünde `CanvasTexture` kullanan bir daire. Gözleri canvas 2D ile her frame (ya da değiştiğinde) çiz. Stil Gumball'daki gibi olsun: kalın siyah çizgiler, düz renkler.
2. **Göz parametreleri** (her ifade bunların bir kombinasyonu): `openness` (0–1, göz kapağı), `pupilX/pupilY` (bakış yönü), `pupilScale`, `shape` ('normal' | 'happyArc' `^ ^` | 'heart' | 'star' | 'spiral' | 'x' | 'line'), `browAngle` ve `browHeight`.
3. **Havada süzülen kaşlar:** göz plakalarının üstünde, kafaya bağlı ince siyah kavisler. Kızgın, üzgün ve şaşkın ifadeler için çok önemli.
4. **Kaset gözleri** (`cassette_eye_L/R`): ikinci, minik bir yüz. Ana ifadeye eşlik etsin (ölçeklenme, zıplama).
5. **İfadeler** (en az bunlar): `neutral`, `happy`, `excited`, `surprised`, `sleepy`, `suspicious`, `love`, `dizzy`, `proud`, `shy` (yanaklara pembe kızarıklık), `thinking`, `wink`, `focused`.
6. İfadeler arası geçiş **yumuşak** olsun: parametreler lerp ile değişsin, ani atlama olmasın. Ama göz kırpma hızlı olsun (~120 ms).
7. **Göz kırpma:** 2–6 saniyede bir rastgele. Arada bir çift kırpma.
8. **Fareyi takip:** göz bebekleri fareye baksın, kafa da hafifçe (en fazla ~10°) o yöne dönsün. Fare uzun süre hareket etmezse etrafa bakınsın.

### AŞAMA 3 — Canlılık (boşta davranışlar)
Juke **hiçbir zaman** tamamen durmasın.

**Sürekli katman** (her zaman çalışır, `useFrame`):
- Nefes: `torso` y-ölçeği ±%2. Kafa da nefesle hafifçe inip kalksın.
- Eller havada hafif süzülsün (farklı fazlarda sinüs).
- Hoparlörler müziğe göre ritmik "bas vuruşu" yapsın: ~100 BPM'de hafif ölçeklenme. Göbekler (`*_cap`) biraz daha fazla oynasın.
- `handle` çok hafif sallansın.
- Ağırlık aktarımı: kalça hafifçe sağa sola kaysın.

**Rastgele davranışlar** (8–20 saniyede bir, aynısı arka arkaya tekrar etmesin):
- Kafa sallayarak küçük bir dans (ayak vurma, eller ritim tutar)
- Etrafına bakınma (`suspicious` → `neutral`)
- Esneme ve ardından `sleepy` (60 saniye etkileşim olmazsa uyuklasın, Z harfleri çıksın, fare hareket edince irkilip uyansın)
- Kendi düğmesine basıp ifadesini değiştirme
- Sapı "boing" diye zıplatma
- Ekrana el sallama
- Yanındaki bir DVD'ye bakıp `thinking` ifadesi yapma

**Parçacıklar:** dans ederken hoparlörlerden müzik notaları, `love` ifadesinde kalpler, utanınca ter damlası. drei `<Sparkles>` ya da basit sprite'lar yeterli.

### AŞAMA 4 — Etkileşimler
- **Düğme 1–4:** tıklanınca düğme içeri basılsın (GSAP, geri yaylanma), "klik" sesi çalsın ve her düğme farklı bir şey tetiklesin:
  - 1 → rastgele mutlu ifade + nota parçacıkları
  - 2 → kısa dans
  - 3 → `dizzy` (gözler spiral, kafa döner)
  - 4 → `love` + kalpler
- **Hoparlöre tıklama:** göz kırpma ve "hey!" tepkisi (`surprised` → `happy`)
- **Kafaya tıklama:** kafa sallanır, kaşlar kalkar
- **Sapa tıklama:** sap "boing" yapar
- **Ellere tıklama:** çak bir beşlik animasyonu
- **Üst üste 5 hızlı tıklama:** `dizzy` + sinirli tepki (kızgın kaşlar), sonra barışır. Gizli küçük sürpriz olsun.
- Fare Juke'un üstüne gelince imleç `pointer` olsun ve Juke fareye baksın.
- Sesler opsiyonel olsun, sağ altta ses aç/kapa düğmesi bulunsun. Varsayılan: kapalı.

### AŞAMA 5 — Süzülen DVD'ler
**Tasarım referansı: `references/dvd_design_sheet.webp`.** DVD'ler bu sayfadaki gibi görünmeli.

1. **DVD kutusu** (`DvdCase.tsx`): yuvarlatılmış kenarlı, hafif parlak siyah plastik kutu. Ön yüzde şeffaf plastik katman altında kapak, solda kutunun menteşe çıkıntısı ve alt kenarında ince yatay çizgiler olsun. Bütün yüzler referanstaki gibi olmalı:
   - **Ön kapak:** renkli çerçeve (projenin rengi). Üstte büyük, kalın, eğlenceli fontla proje adı (referanstaki "SPACE DOGS" ve "PIZZA PLANET" tarzı; Google Fonts'tan "Lilita One" ya da "Bagel Fat One" gibi). Ortada **proje thumbnail'i**. Altta renkli şerit üstünde sol köşede küçük ikon rozeti, yanında 2 satır kısa açıklama, sağ altta küçük "DVD" logosu.
   - **Sırt:** dikey proje adı, üstte küçük ikon (emoji), altta "DVD" logosu, proje renginde.
   - **Arka yüz:** proje adı, kısa açıklama paragrafı, 2–3 küçük ekran görüntüsü (varsa), barkod.
   - **Disk:** kapak görselinden üretilmiş baskı, ortada şeffaf delik halkası, kenarda gökkuşağı yansıması (iridescence).
   - **İç kısım:** kutu açıldığında solda boş iç kapak, sağda disk.
2. **Kapaklar tamamen veriden otomatik üretilsin.** Bütün yüzleri canvas ile çiz (`coverTexture.ts`). Ben sadece `projects.ts`'e veri ve `public/projects/`'e görsel ekleyeceğim, kapak kendiliğinden oluşacak. Elle tasarım yapmak zorunda kalmamalıyım.
3. **Proje verisi henüz hazır değil.** Şimdilik `projects.ts`'e referanstaki isimlerle **6 örnek proje** koy: Space Dogs, Pizza Planet, Monster Camp, Bubble Trip, Ocean Boy, Night Race. Her birine farklı renk, emoji ve Juke ifadesi ver. Thumbnail yerine renkli, basit bir **yer tutucu illüstrasyon** canvas ile çizilsin. Sonra ben bunları kendi projelerimle değiştireceğim. Veri yapısı şöyle olsun:
   ```ts
   {
     slug: 'space-dogs',
     title: 'Space Dogs',
     tagline: 'Kısa bir cümle',          // kapaktaki 2 satır
     description: 'Uzun açıklama',        // arka yüz ve proje sayfası
     thumbnail: '/projects/space-dogs/thumb.jpg',   // yoksa yer tutucu çizilir
     screenshots: ['/projects/space-dogs/1.jpg'],   // opsiyonel
     color: '#5b3fd1',
     icon: '🪐',
     tech: ['React', 'Three.js'],
     links: { live: '', github: '' },
     jukeExpression: 'love',
   }
   ```
   - Thumbnail dosyası yoksa ya da yüklenemezse **hata verme**, yer tutucuyu göster.
   - Uzun proje isimleri kapağa sığmazsa font otomatik küçülsün ya da iki satıra bölünsün.
   - Proje sayısı 1 ile 12 arasında değişebilir. Yerleşim buna göre kendini ayarlasın.
   - Proje klasörüne `public/projects/README.md` ekle ve yeni bir projenin nasıl ekleneceğini (görsel boyutu: thumbnail için 800×800 önerilir) 3–4 adımda yaz.
4. DVD'ler Juke'un sağ tarafında, hafif dağınık bir yay şeklinde dursun. drei `<Float>` ile **olduğu yerde** süzülsünler: hafif yukarı-aşağı ve hafif dönme, her biri farklı fazda.
5. **Hover:** DVD öne gelir, biraz büyür, kenarında ışık parlar, içindeki disk kutudan biraz kayıp gökkuşağı yansımasını gösterir (iridescence materyali). Juke o DVD'ye bakar ve o projenin ifadesinin hafif bir versiyonunu yapar.
6. Mobilde DVD'ler ekranın altında yatay kaydırılabilir bir sıra olsun.

### AŞAMA 6 — DVD seçme ve geçiş (en önemli an)
DVD'ye tıklanınca GSAP timeline ile şu sıra oynasın (toplam ~2,5 sn):
1. Juke projeye özel ifadeyi yapar (`projects.ts`'teki `jukeExpression`).
2. DVD Juke'a doğru uçar. Juke bir eliyle yakalar.
3. `cassette_door` açılır (rotation.x 0 → ~1.2, hafif sekme ile).
4. Disk kutudan çıkar, dönerek kaset yuvasına girer. Kutu kaybolur.
5. Kapak kapanır. Hoparlörler bir kez güçlü "bas vuruşu" yapar, gözler `excited` olur.
6. Kamera kaset penceresine doğru yaklaşır (dolly + hafif FOV daralması). Pencere ekranı doldurur.
7. Kaset penceresinden beyaz/renkli bir parlama → **proje sayfası** açılır (`/project/:slug`, React Router). Sayfa bir "teyp/DVD oynatıcı ekranı" havasında olsun.
8. **Geri dönüş:** "⏏ Çıkar" düğmesi. Animasyon tersine oynar: kamera geri çekilir, kapak açılır, DVD çıkar ve yerine süzülerek döner, Juke el sallar.
- Geçiş sırasında başka tıklamalar kilitlensin.
- Proje sayfasına doğrudan URL ile girilirse animasyonsuz açılsın.

**Proje sayfası içeriği** (`projects.ts`'ten): büyük kapak görseli, proje adı, uzun açıklama, ekran görüntüleri galerisi, kullanılan teknolojiler (rozet olarak), canlı site ve GitHub linkleri. Tasarım DVD kapağıyla aynı renk ve fontta olsun. Sayfanın bir köşesinde küçük bir Juke ikonu dursun ve sayfayı kaydırdıkça gözleri ona göre hareket etsin.

### AŞAMA 7 — Fotoğraf arka planı "canlı" yapmak
Arka plan `public/bg/room.jpg` fotoğraf olarak kalacak ama durağan bir fotoğraf gibi durmayacak. Fotoğraf: gün batımında bir çocuk odası. Ortada ranza, sağda beyaz kapı ve şifonyer, solda dolap, lamba ve japon fener tavan lambası var. Pencere kadrajın dışında, solda. Içeri giren turuncu güneş lekeleri duvarlara, kapıya ve halıya düşüyor. Bu lekelerin içinde **pencere çerçevesi ve ağaç yapraklarının gölgeleri** var.

Kullanılacak dosyalar (hepsi `public/bg/` içinde, maskelerde beyaz = efekt alanı, siyah = dokunma):
- `depth.png` → derinlik haritası (açık renk = yakın)
- `mask_sun.png` → güneş lekelerinin olduğu bütün alanlar
- `mask_lamp.png` → tavandaki fener lamba
- `mask_fishbowl.png` → dolabın üstündeki akvaryum küresi
- `mask_pennant.png` → sol üst köşedeki flama

Efektler:
1. **Derinlik parallax'ı:** fotoğrafı tam ekran bir düzleme özel shader ile koy. `depth.png` ile fare hareketine (mobilde jiroskop) göre çok hafif 2.5D kayma yap. Kenarlarda boşluk görünmesin, fotoğrafı %5 büyüt. Derinlik haritası Depth Anything V2 ile üretildi (8-bit, açık renk = yakın). Nesne kenarlarında yırtılma olmaması için shader'da derinliği hafifçe yumuşat ve kaydırma miktarını küçük tut (en fazla UV'nin ~%1,5'i). Ön plandaki sol duvar ve sağdaki şifonyer en çok, arka duvar en az kaymalı.
2. **Rüzgârda yaprak gölgeleri (ana efekt):** `mask_sun.png` içinde, prosedürel noise ile yaprak gölgesi deseni üret ve yavaşça salla. Mevcut gölgeleri hafifçe kaydıran UV distorsiyonu da ekle. Dışarıda ağaç rüzgârda sallanıyormuş gibi görünmeli. Yoğunluğu düşük tut, abartma.
3. **Güneşin nefes alması:** `mask_sun.png` alanının parlaklığı 10–20 saniyelik döngüyle %5–10 artıp azalsın. Arada bir bulut geçiyormuş gibi kısa bir kararma olsun.
4. **Işık huzmesi ve toz:** soldan (kadraj dışındaki pencereden) sağa doğru inen, çok şeffaf volumetrik ışık huzmeleri. Huzmelerin içinde yavaşça süzülen toz parçacıkları olsun. Parçacıklar huzme içindeyken parlasın, dışına çıkınca kaybolsun.
5. **Tavan lambası:** `mask_lamp.png` bölgesinde çok hafif sıcak bir parıltı (bloom) ve çok yavaş, hafif bir sallanma (UV kayması ile).
6. **Akvaryum:** `mask_fishbowl.png` içinde suyun kırılmasını taklit eden hafif dalgalanma ve parıltı.
7. **Flama:** `mask_pennant.png` bölgesinde rüzgârda hafif dalgalanma.
8. **Ortam:** çok hafif film grain, vignette, sıcak renk tonu.
9. **Juke'u fotoğrafa oturtmak:** Juke ranzanın önündeki halıda dursun. Ana ışık soldan-önden gelen sıcak turuncu gün batımı ışığı olsun (yaklaşık #ffb35c). Dolgu ışığı duvar renginden yansıyan soğuk yeşilimsi ton olsun. Gölgesi sağa-arkaya doğru, halıdaki diğer gölgelerle aynı yöne düşsün (`ShadowMaterial` düzlemi + `<ContactShadows>`). Juke'un üstünden de hafifçe yaprak gölgesi geçsin, böylece aynı ışığın altında durduğu hissi oluşur. Juke **fotoğrafın üstüne yapıştırılmış gibi durmamalı**.
- DVD'ler de aynı ışık ve renk tonuyla aydınlatılsın.
- Bir maske dosyası yoksa o efekti atla ve bana hangi maskenin eksik olduğunu söyle.

### AŞAMA 7.5 — Juke, oda ve DVD'ler arasındaki etkileşim
Amaç: Juke, oda ve DVD'ler **birbirinden haberdar** olsun. Sahnede her şey birbirine tepki veriyormuş gibi hissettirmeli. Bütün olaylar ortak bir olay sisteminden (`zustand` ya da basit bir event bus) geçsin.

**Juke odaya tepki verir:**
- Bulut geçip güneş kararınca Juke sola, pencereye doğru bakar. Güneş tekrar parlayınca gözlerini kısar.
- Bir toz parçacığı Juke'un kafasına konar → Juke hapşırır (bütün gövde sarsılır, sap zıplar). Yakındaki DVD'ler de bu sarsıntıyla sallanır. Bu nadiren olsun.
- Tavan lambası sallanınca arada bir yukarı bakar ve gözleriyle takip eder.
- Fare odadaki bir nesnenin üstüne gelince (lamba, akvaryum, kapı, kaykay gibi) Juke o noktaya bakar.

**Oda tıklanabilir olsun** (maskelerden tıklanan noktanın değeri okunarak):
- **Lamba:** daha çok sallanır, Juke gözleriyle takip eder ve sersemler (`dizzy`).
- **Akvaryum:** su dalgalanır, Juke merakla bakar (`surprised` → `happy`).
- **Flama:** rüzgârla dalgalanır, Juke üşümüş gibi titrer.
- **Güneş lekesi:** tıklanan noktada yaprak gölgeleri bir an hızlanır, sanki rüzgâr esmiş gibi. Toz parçacıkları savrulur.

**Juke ve DVD'ler:**
- Juke dans ederken DVD'ler de ritme göre hafifçe zıplar.
- Hoparlörlerin güçlü bas vuruşunda yakındaki DVD'ler küçük bir şok dalgasıyla itilir ve yerlerine geri döner. Işık huzmesindeki toz da savrulur.
- Juke uyuklarken DVD'ler daha yavaş süzülür. Juke uyanınca hepsi bir anda "irkilir".
- Boştayken Juke arada bir yakındaki bir DVD'ye uzanır: parmağıyla dürtüp döndürür ya da yamuk duranı düzeltir. Sonra memnun bir ifade yapar.
- DVD'ler de Juke'a doğru çok hafif yönelsin, sanki ona bakıyorlarmış gibi.
- Çok hızlı DVD'lerin üstünde gezinirsen Juke'un gözleri bir DVD'den diğerine hızlıca atlasın. Uzun süre üstünde kalırsan heyecanlansın.

### AŞAMA 8 — Cilalama ve performans
- Açılış: kısa bir yükleme ekranı. Juke uyanır, gerinir ve el sallar.
- `prefers-reduced-motion` açıksa animasyonları azalt.
- Mobil: DPR en fazla 1.5, post-processing hafif, parçacık sayısı yarıya.
- Hedef: masaüstünde 60 fps, orta seviye telefonda 30+ fps. Lighthouse performans skoru 85+.
- Klavye erişimi: DVD'ler Tab ile gezilebilsin, Enter ile seçilebilsin. Her DVD'nin aria etiketi olsun.
- Bütün ifade, davranış ve zamanlama ayarları tek bir `src/juke/config.ts` dosyasında toplansın. Ben sonradan kolayca değiştirebileyim.

### Kod düzeni
```
src/
  juke/        Juke.tsx, EyePlate.tsx, Brows.tsx, expressions.ts, behaviors.ts, config.ts, useJukeStore.ts
  dvd/         DvdCase.tsx, DvdShelf.tsx, coverTexture.ts
  scene/       Background.tsx (parallax + efekt shader'ları), Lights.tsx, Effects.tsx, RoomHotspots.tsx (maskeden tıklama)
  events/      sceneEvents.ts (Juke, oda ve DVD'ler arasındaki ortak olay sistemi)
  transitions/ insertDvd.ts (GSAP timeline)
  pages/       Home.tsx, Project.tsx
  data/        projects.ts
```

**Şimdi Aşama 1 ile başla.**
