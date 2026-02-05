import pyodbc
print("START_DRIVERS")
for d in pyodbc.drivers():
    print(f"DRIVER: {d}")
print("END_DRIVERS")
