# Generated by Django 5.1.2 on 2024-10-31 02:23

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('mainapp', '0005_alter_processingdimension_options_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='processingdimension',
            name='type',
            field=models.CharField(choices=[('cleaning', '数据清洗'), ('labeling', '数据标注')], default='cleaning', max_length=20, verbose_name='维度类型'),
        ),
    ]
