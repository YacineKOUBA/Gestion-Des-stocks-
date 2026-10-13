# Lecture seule : affiche l'en-tetre et les N premieres lignes de donnees
# de l'onglet PRODUIT du classeur officiel, colonne par colonne.
import sys
import openpyxl

XLSX = r"C:\Users\Y.DROUICHE\Downloads\GD TRADING-GESTION DES STOCKS.xlsx"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 3  # lignes de donnees a afficher

wb = openpyxl.load_workbook(XLSX, data_only=True, read_only=True)
ws = wb["PRODUIT"]

rows = ws.iter_rows(min_row=1, max_row=1 + N, values_only=True)
header = next(rows)
print("=== EN-TETE ===")
for i, h in enumerate(header, start=1):
    if h is not None:
        print(f"  col {i:>2} : {h}")

print(f"=== {N} PREMIERES LIGNES DE DONNEES ===")
for n, row in enumerate(rows, start=1):
    print(f"--- donnee #{n} (ligne Excel {1 + n}) ---")
    for i, v in enumerate(row, start=1):
        if v is not None and str(v).strip() != "":
            print(f"  col {i:>2} : {v!r}")
wb.close()
