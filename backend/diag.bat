@echo off
echo --- DRIVERS --- > diag.out
powershell -Command "Get-OdbcDriver | Select-Object -ExpandProperty Name" >> diag.out
echo --- NETSTAT --- >> diag.out
netstat -ano | findstr :1433 >> diag.out
echo --- TICK --- >> diag.out
echo DONE >> diag.out
