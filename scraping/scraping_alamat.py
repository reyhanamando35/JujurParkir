from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import pandas as pd
import time 

driver = webdriver.Chrome()
driver.get("https://dishub.surabaya.go.id/spm/ArsiParkir/padtju/datatitikparkir")

data_parkir = []

for page in range(1, 137):
    print(f"Scraping halaman {page}...")
    
    WebDriverWait(driver, 10).until(
        EC.presence_of_element_located((By.XPATH, "//table/tbody/tr"))
    )
    
    rows = driver.find_elements(By.XPATH, "//table/tbody/tr")
    for row in rows:
        cols = row.find_elements(By.TAG_NAME, "td")
        if len(cols) >= 4:
            data_parkir.append({
                "No": cols[0].text,
                "Alamat": cols[1].text,
                "Lokasi": cols[2].text,
                "Jam_Jaga": cols[3].text
            })
            
    try:
        parent_li = driver.find_element(By.ID, "table-1_next")
        if "disabled" in parent_li.get_attribute("class"):
            print("Halaman terakhir tercapai. Menghentikan scraping.")
            break
            
        next_btn = driver.find_element(By.CSS_SELECTOR, "li#table-1_next a")
        next_btn.click()
        
        print("Menunggu 3 detik agar data tidak double...")
        time.sleep(3)
        
    except Exception as e:
        print(f"Tombol next tidak ditemukan atau error di halaman {page}. Berhenti.")
        break

driver.quit()

df = pd.DataFrame(data_parkir)
df.to_csv("data_parkir_surabaya.csv", index=False)
print(f"Selesai! Total {len(df)} data berhasil disimpan ke data_parkir_surabaya.csv")