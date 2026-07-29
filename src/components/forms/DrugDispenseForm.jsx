import React from 'react';

const DrugDispenseForm = ({ level: _level }) => {
  const cardStyle = "bg-white/70 backdrop-blur-md p-6 rounded-3xl border border-white shadow-xl shadow-gray-200/50 hover:shadow-indigo-100 transition-all duration-300 group";
  const inputStyle = "w-full mt-3 p-3.5 bg-white/50 border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-indigo-500 rounded-2xl outline-none text-center font-black text-indigo-900 text-lg shadow-inner";

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-10 duration-1000" dir="rtl">
      
      {/* قسم المنصرف المجاني - حقول إحصائية */}
      <section>
        <div className="flex items-center gap-4 mb-6">
          <div className="bg-indigo-600 p-3 rounded-2xl shadow-lg shadow-indigo-200">
            <span className="text-white text-xl">🎁</span>
          </div>
          <div>
            <h3 className="text-xl font-black text-gray-800">المنصرف المجاني</h3>
            <p className="text-sm text-gray-500 font-medium">إجمالي الحالات التي تم صرف العلاج لها مجاناً</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className={cardStyle}>
            <label className="text-indigo-900 text-sm font-black flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span> هيئة
            </label>
            <input type="number" placeholder="0" className={inputStyle} />
          </div>
          <div className={cardStyle}>
            <label className="text-indigo-900 text-sm font-black flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span> طلبة
            </label>
            <input type="number" placeholder="0" className={inputStyle} />
          </div>
          <div className={cardStyle}>
            <label className="text-indigo-900 text-sm font-black flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span> رضع
            </label>
            <input type="number" placeholder="0" className={inputStyle} />
          </div>
          <div className={cardStyle}>
            <label className="text-indigo-900 text-sm font-black flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span> معيلات
            </label>
            <input type="number" placeholder="0" className={inputStyle} />
          </div>
        </div>
      </section>

      {/* قسم المنصرف المدعم - حقول مالية */}
      <section>
        <div className="flex items-center gap-4 mb-6">
          <div className="bg-emerald-500 p-3 rounded-2xl shadow-lg shadow-emerald-100">
            <span className="text-white text-xl">💰</span>
          </div>
          <div>
            <h3 className="text-xl font-black text-gray-800">المنصرف المدعم</h3>
            <p className="text-sm text-gray-500 font-medium">القيم المالية وحصص المشاركة للمرضى</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className={`${cardStyle} border-b-4 border-b-emerald-500`}>
            <label className="text-emerald-800 text-sm font-black">قيمة الهيئة (مدعم)</label>
            <input type="number" step="0.01" placeholder="0.00" className={inputStyle} />
          </div>
          <div className={`${cardStyle} border-b-4 border-b-amber-500`}>
            <label className="text-amber-800 text-sm font-black">حصة المريض (مدعم)</label>
            <input type="number" step="0.01" placeholder="0.00" className={inputStyle} />
          </div>
          <div className={cardStyle}>
            <label className="text-gray-600 text-sm font-black">ملاحظات الشهر</label>
            <textarea rows="1" className={`${inputStyle} text-right font-medium text-base h-[54px] pt-3`} placeholder="أضف ملاحظاتك هنا..."></textarea>
          </div>
        </div>
      </section>

      {/* زر الحفظ العصرى */}
      <div className="pt-6">
        <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-black py-5 rounded-3xl shadow-2xl shadow-indigo-200 transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3">
          <span>💾</span> حفظ إحصائية الشهر النهائية
        </button>
      </div>
    </div>
  );
};

export default DrugDispenseForm;