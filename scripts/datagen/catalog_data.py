"""Master data for the synthetic dataset: categories, products (INN names, no brands), suppliers.

Demand figures are base units per day for a mid-size hospital's central pharmacy warehouse.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Category:
    code: str
    name: str
    season: str  # key into SEASON_PROFILES in seed.py


@dataclass(frozen=True)
class ProductSpec:
    sku: str
    name: str
    ingredient: str
    strength: str
    form: str
    category: str
    storage: str  # NORMAL | COOL | COLD
    prescription: bool
    base_unit: str
    units: tuple[tuple[str, int], ...]  # packaging units above the base unit
    unit_cost: int  # VND per base unit
    daily_demand: float
    shelf_life_months: int
    min_shelf_life_days: int


@dataclass(frozen=True)
class SupplierSpec:
    code: str
    name: str
    phone: str
    address: str
    lead_time_mean: float
    lead_time_std: float
    categories: tuple[str, ...]


CATEGORIES: tuple[Category, ...] = (
    Category("KS", "Kháng sinh", "respiratory"),
    Category("GD", "Giảm đau - Hạ sốt", "dengue"),
    Category("HH", "Hô hấp", "respiratory"),
    Category("TH", "Tiêu hóa", "digestive"),
    Category("DU", "Dị ứng", "allergy"),
    Category("TM", "Tim mạch - Huyết áp", "chronic"),
    Category("DTD", "Đái tháo đường", "chronic"),
    Category("VT", "Vitamin - Khoáng chất", "flat"),
    Category("DN", "Dịch truyền - Điện giải", "dengue"),
    Category("SP", "Vắc xin - Sinh phẩm", "campaign"),
    Category("DL", "Da liễu", "digestive"),
    Category("TMH", "Mắt - Tai mũi họng", "allergy"),
)

V = (("Vỉ", 10), ("Hộp", 100))
V30 = (("Vỉ", 10), ("Hộp", 30))
GOI = (("Hộp", 20),)
CHAI = (("Thùng", 24),)
ONG = (("Hộp", 10),)
TUYP = (("Hộp", 1),)

PRODUCTS: tuple[ProductSpec, ...] = (
    ProductSpec("PARA500", "Paracetamol", "Paracetamol", "500mg", "Viên nén", "GD", "NORMAL", False, "Viên", V, 350, 900, 36, 180),
    ProductSpec("PARA250G", "Paracetamol", "Paracetamol", "250mg", "Gói bột", "GD", "NORMAL", False, "Gói", GOI, 1200, 160, 24, 180),
    ProductSpec("IBU400", "Ibuprofen", "Ibuprofen", "400mg", "Viên nén", "GD", "NORMAL", False, "Viên", V, 600, 220, 36, 180),
    ProductSpec("DICLO50", "Diclofenac", "Diclofenac natri", "50mg", "Viên bao tan ruột", "GD", "NORMAL", True, "Viên", V, 450, 140, 36, 180),
    ProductSpec("PARAINF", "Paracetamol truyền", "Paracetamol", "1g/100ml", "Dịch truyền", "GD", "NORMAL", True, "Chai", CHAI, 28000, 35, 24, 180),
    ProductSpec("AMOX500", "Amoxicillin", "Amoxicillin", "500mg", "Viên nang", "KS", "NORMAL", True, "Viên", V, 1200, 480, 36, 180),
    ProductSpec("AUG625", "Amoxicillin + Acid clavulanic", "Amoxicillin; Acid clavulanic", "500mg/125mg", "Viên nén bao phim", "KS", "NORMAL", True, "Viên", (("Vỉ", 7), ("Hộp", 14)), 6500, 210, 24, 180),
    ProductSpec("CEFU500", "Cefuroxim", "Cefuroxim axetil", "500mg", "Viên nén bao phim", "KS", "NORMAL", True, "Viên", V, 5200, 160, 24, 180),
    ProductSpec("CEFT1G", "Ceftriaxon", "Ceftriaxon natri", "1g", "Bột pha tiêm", "KS", "NORMAL", True, "Lọ", ONG, 18000, 90, 36, 180),
    ProductSpec("AZI500", "Azithromycin", "Azithromycin", "500mg", "Viên nén bao phim", "KS", "NORMAL", True, "Viên", (("Vỉ", 3), ("Hộp", 3)), 9800, 75, 36, 180),
    ProductSpec("CIPRO500", "Ciprofloxacin", "Ciprofloxacin", "500mg", "Viên nén bao phim", "KS", "NORMAL", True, "Viên", V, 1500, 130, 36, 180),
    ProductSpec("METRO250", "Metronidazol", "Metronidazol", "250mg", "Viên nén", "KS", "NORMAL", True, "Viên", V, 400, 110, 36, 180),
    ProductSpec("AMBRO30", "Ambroxol", "Ambroxol hydroclorid", "30mg", "Viên nén", "HH", "NORMAL", False, "Viên", V, 500, 260, 36, 180),
    ProductSpec("ACETYL200", "Acetylcystein", "Acetylcystein", "200mg", "Gói cốm", "HH", "NORMAL", False, "Gói", (("Hộp", 30),), 1800, 240, 24, 180),
    ProductSpec("SALBU", "Salbutamol khí dung", "Salbutamol sulfat", "2.5mg/2.5ml", "Ống khí dung", "HH", "NORMAL", True, "Ống", (("Vỉ", 5), ("Hộp", 20)), 4200, 120, 24, 180),
    ProductSpec("BUDES", "Budesonid khí dung", "Budesonid", "0.5mg/2ml", "Ống khí dung", "HH", "COOL", True, "Ống", (("Vỉ", 5), ("Hộp", 20)), 15500, 45, 24, 180),
    ProductSpec("DEXTRO15", "Dextromethorphan", "Dextromethorphan HBr", "15mg", "Viên nang", "HH", "NORMAL", False, "Viên", V, 600, 150, 36, 180),
    ProductSpec("OMEP20", "Omeprazol", "Omeprazol", "20mg", "Viên nang tan ruột", "TH", "NORMAL", True, "Viên", V, 700, 380, 36, 180),
    ProductSpec("ESOME40", "Esomeprazol", "Esomeprazol magnesi", "40mg", "Viên nén bao tan ruột", "TH", "NORMAL", True, "Viên", V, 3800, 170, 24, 180),
    ProductSpec("DIOS3", "Diosmectit", "Diosmectit", "3g", "Gói bột", "TH", "NORMAL", False, "Gói", (("Hộp", 30),), 2600, 140, 36, 180),
    ProductSpec("BERBE", "Berberin", "Berberin clorid", "100mg", "Viên nén", "TH", "NORMAL", False, "Viên", (("Lọ", 100),), 120, 300, 36, 180),
    ProductSpec("DOMPE10", "Domperidon", "Domperidon", "10mg", "Viên nén", "TH", "NORMAL", True, "Viên", V, 450, 120, 36, 180),
    ProductSpec("LOPER2", "Loperamid", "Loperamid hydroclorid", "2mg", "Viên nang", "TH", "NORMAL", False, "Viên", V, 300, 70, 36, 180),
    ProductSpec("PROBIO", "Men vi sinh", "Bacillus clausii", "2 tỷ bào tử/5ml", "Hỗn dịch uống", "TH", "COOL", False, "Ống", (("Hộp", 20),), 7500, 90, 24, 180),
    ProductSpec("LORA10", "Loratadin", "Loratadin", "10mg", "Viên nén", "DU", "NORMAL", False, "Viên", V, 300, 210, 36, 180),
    ProductSpec("CETI10", "Cetirizin", "Cetirizin dihydroclorid", "10mg", "Viên nén bao phim", "DU", "NORMAL", False, "Viên", V, 250, 180, 36, 180),
    ProductSpec("FEXO180", "Fexofenadin", "Fexofenadin HCl", "180mg", "Viên nén bao phim", "DU", "NORMAL", False, "Viên", V, 2800, 70, 36, 180),
    ProductSpec("CHLOR4", "Clorpheniramin", "Clorpheniramin maleat", "4mg", "Viên nén", "DU", "NORMAL", False, "Viên", V, 60, 260, 36, 180),
    ProductSpec("AMLO5", "Amlodipin", "Amlodipin besilat", "5mg", "Viên nén", "TM", "NORMAL", True, "Viên", V, 300, 650, 36, 180),
    ProductSpec("LOSA50", "Losartan", "Losartan kali", "50mg", "Viên nén bao phim", "TM", "NORMAL", True, "Viên", V30, 900, 420, 36, 180),
    ProductSpec("ATOR20", "Atorvastatin", "Atorvastatin calci", "20mg", "Viên nén bao phim", "TM", "NORMAL", True, "Viên", V30, 1100, 380, 36, 180),
    ProductSpec("BISO5", "Bisoprolol", "Bisoprolol fumarat", "5mg", "Viên nén bao phim", "TM", "NORMAL", True, "Viên", V30, 850, 260, 36, 180),
    ProductSpec("CLOPI75", "Clopidogrel", "Clopidogrel", "75mg", "Viên nén bao phim", "TM", "NORMAL", True, "Viên", V30, 1900, 230, 36, 180),
    ProductSpec("ASPI81", "Aspirin", "Acid acetylsalicylic", "81mg", "Viên nén bao tan ruột", "TM", "NORMAL", False, "Viên", V30, 200, 340, 36, 180),
    ProductSpec("FURO40", "Furosemid", "Furosemid", "40mg", "Viên nén", "TM", "NORMAL", True, "Viên", V, 250, 120, 48, 180),
    ProductSpec("METF850", "Metformin", "Metformin hydroclorid", "850mg", "Viên nén bao phim", "DTD", "NORMAL", True, "Viên", V, 450, 720, 36, 180),
    ProductSpec("GLICL30", "Gliclazid", "Gliclazid", "30mg", "Viên nén giải phóng kéo dài", "DTD", "NORMAL", True, "Viên", V30, 1300, 300, 36, 180),
    ProductSpec("INSMIX", "Insulin hỗn hợp 30/70", "Insulin người", "100IU/ml x 10ml", "Hỗn dịch tiêm", "DTD", "COLD", True, "Lọ", (("Hộp", 1),), 95000, 14, 30, 120),
    ProductSpec("INSPEN", "Insulin glargin bút tiêm", "Insulin glargin", "100IU/ml x 3ml", "Dung dịch tiêm", "DTD", "COLD", True, "Bút", (("Hộp", 5),), 210000, 6, 24, 120),
    ProductSpec("VITC500", "Vitamin C", "Acid ascorbic", "500mg", "Viên nén", "VT", "NORMAL", False, "Viên", V, 150, 300, 24, 180),
    ProductSpec("VITB1B6", "Vitamin 3B", "Vitamin B1; B6; B12", "125mg/125mg/125mcg", "Viên nang", "VT", "NORMAL", False, "Viên", V, 400, 260, 24, 180),
    ProductSpec("CALCI", "Calci + Vitamin D3", "Calci carbonat; Cholecalciferol", "1250mg/440IU", "Viên nén", "VT", "NORMAL", False, "Viên", V30, 1600, 180, 24, 180),
    ProductSpec("SATFOL", "Sắt + Acid folic", "Sắt fumarat; Acid folic", "162mg/0.75mg", "Viên nang", "VT", "NORMAL", False, "Viên", V30, 900, 150, 24, 180),
    ProductSpec("ZINC10", "Kẽm gluconat", "Kẽm gluconat", "10mg/5ml", "Siro", "VT", "NORMAL", False, "Chai", (("Thùng", 40),), 22000, 18, 24, 180),
    ProductSpec("ORS", "Oresol", "Natri clorid; Kali clorid; Natri citrat; Glucose", "27.9g", "Gói bột", "DN", "NORMAL", False, "Gói", (("Hộp", 40),), 1500, 260, 36, 180),
    ProductSpec("NACL09", "Natri clorid 0.9%", "Natri clorid", "500ml", "Dịch truyền", "DN", "NORMAL", True, "Chai", CHAI, 9500, 160, 36, 180),
    ProductSpec("RINGER", "Ringer lactat", "Ringer lactat", "500ml", "Dịch truyền", "DN", "NORMAL", True, "Chai", CHAI, 11000, 110, 36, 180),
    ProductSpec("GLU5", "Glucose 5%", "Glucose", "500ml", "Dịch truyền", "DN", "NORMAL", True, "Chai", CHAI, 10000, 90, 36, 180),
    ProductSpec("VXCUM", "Vắc xin cúm mùa", "Vắc xin cúm bất hoạt", "0.5ml", "Hỗn dịch tiêm", "SP", "COLD", True, "Liều", (("Hộp", 10),), 185000, 12, 12, 120),
    ProductSpec("VXUV", "Huyết thanh kháng uốn ván", "Kháng độc tố uốn ván", "1500IU", "Dung dịch tiêm", "SP", "COLD", True, "Ống", (("Hộp", 10),), 32000, 9, 24, 120),
    ProductSpec("BETAD", "Povidon iod 10%", "Povidon iod", "100ml", "Dung dịch dùng ngoài", "DL", "NORMAL", False, "Chai", (("Thùng", 50),), 18000, 22, 36, 180),
    ProductSpec("FUCID", "Acid fusidic 2%", "Acid fusidic", "15g", "Kem bôi da", "DL", "NORMAL", True, "Tuýp", TUYP, 42000, 11, 24, 180),
    ProductSpec("HYDRO1", "Hydrocortison 1%", "Hydrocortison acetat", "10g", "Kem bôi da", "DL", "NORMAL", True, "Tuýp", TUYP, 15000, 14, 24, 180),
    ProductSpec("NACLMAT", "Natri clorid 0.9% nhỏ mắt", "Natri clorid", "10ml", "Dung dịch nhỏ mắt", "TMH", "NORMAL", False, "Lọ", (("Hộp", 1),), 3000, 85, 24, 180),
    ProductSpec("TOBRA", "Tobramycin nhỏ mắt", "Tobramycin", "0.3% x 5ml", "Dung dịch nhỏ mắt", "TMH", "COOL", True, "Lọ", (("Hộp", 1),), 38000, 16, 24, 180),
    ProductSpec("XYLO", "Xylometazolin xịt mũi", "Xylometazolin HCl", "0.05% x 15ml", "Dung dịch xịt mũi", "TMH", "NORMAL", False, "Lọ", (("Hộp", 1),), 26000, 28, 24, 180),
)

SUPPLIERS: tuple[SupplierSpec, ...] = (
    SupplierSpec("PNAM", "Công ty CP Dược phẩm Phương Nam", "02838123456", "Quận 10, TP.HCM", 3.5, 1.0,
                 ("GD", "KS", "TH", "VT")),
    SupplierSpec("SHONG", "Công ty TNHH Dược Sông Hồng", "02437654321", "Hoàn Kiếm, Hà Nội", 7.0, 2.5,
                 ("HH", "DU", "TM", "KS")),
    SupplierSpec("DNAI", "Công ty CP Dược Đồng Nai", "02513889900", "Biên Hòa, Đồng Nai", 4.5, 1.5,
                 ("TM", "DTD", "TH", "DL")),
    SupplierSpec("ACHAU", "Công ty TNHH Phân phối Dược Á Châu", "02839112233", "Tân Bình, TP.HCM", 9.0, 3.0,
                 ("KS", "DU", "TMH", "VT")),
    SupplierSpec("MEKONG", "Công ty CP Dược Mekong", "02923771122", "Ninh Kiều, Cần Thơ", 5.0, 1.2,
                 ("DN", "GD", "DL", "TMH")),
    SupplierSpec("LANHVN", "Công ty TNHH Dược phẩm Lạnh Việt", "02836667788", "Thủ Đức, TP.HCM", 6.0, 1.8,
                 ("SP", "DTD", "HH")),
)

DESTINATIONS: tuple[str, ...] = ("Nhà thuốc bệnh viện", "Khoa Nội tổng hợp", "Khoa Nhi", "Khoa Ngoại", "Khoa Cấp cứu")
