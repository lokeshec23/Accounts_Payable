import pyodbc
drivers = pyodbc.drivers()
with open("app/database/drivers.txt", "w") as f:
    for d in drivers:
        f.write(f"{d}\n")
