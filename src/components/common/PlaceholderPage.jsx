import React from 'react';
import PageHeader from '../ui/PageHeader';
import Breadcrumb from '../ui/Breadcrumb';
import Card from '../ui/Card';
import { Construction } from 'lucide-react';

const PlaceholderPage = ({ title, icon: Icon }) => {
  return (
    <div className="space-y-6 animate-fadeIn">
      <Breadcrumb items={[{ label: title }]} />
      <PageHeader
        title={title}
        icon={Icon}
        description="هذه الصفحة قيد التطوير حالياً ضمن المرحلة القادمة."
      />

      <Card className="p-20 flex flex-col items-center justify-center text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-cyan-50 flex items-center justify-center text-cyan-500">
          <Construction size={32} />
        </div>
        <h2 className="text-xl font-bold text-cyan-900">قريباً...</h2>
        <p className="text-cyan-600 max-w-md">
          جاري العمل على بناء واجهة {title} وتجهيز العمليات الخاصة بها لتتوافق مع نظام الـ 3 Layers الجديد.
        </p>
      </Card>
    </div>
  );
};

export default PlaceholderPage;
