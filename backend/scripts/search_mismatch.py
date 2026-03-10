import os

search_term = "amount_mismatch"
results = []

for root, dirs, files in os.walk("c:/Users/ldna40063/Accounts_Payable/backend"):
    for file in files:
        if file.endswith((".py", ".js", ".jsx", ".html", ".css", ".env", ".txt", ".json")):
            path = os.path.join(root, file)
            try:
                with open(path, "r", encoding="utf-8", errors="ignore") as f:
                    for i, line in enumerate(f, 1):
                        if search_term in line:
                            results.append(f"{path}:{i}: {line.strip()}")
            except Exception as e:
                pass

with open("c:/Users/ldna40063/Accounts_Payable/backend/output/search_results.txt", "w") as f:
    if results:
        f.write("\n".join(results))
    else:
        f.write("No results found.")

print(f"Search complete. Found {len(results)} occurrences.")
